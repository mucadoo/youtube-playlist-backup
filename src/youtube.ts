import { youtube, type youtube_v3 } from "@googleapis/youtube";
import type { OAuth2Client } from "google-auth-library";
import type { FetchedItem, FetchedPlaylist } from "./types.js";

const UNAVAILABLE_TITLES = new Set(["Deleted video", "Private video"]);

export function youtubeClient(auth: OAuth2Client | string): youtube_v3.Youtube {
  return youtube({ version: "v3", auth });
}

/**
 * Expands PLAYLIST_IDS entries into concrete playlist ids:
 * - "mine"          → every playlist of the authenticated user, private ones included (OAuth)
 * - "@handle"       → every public playlist of that channel
 * - "channel:UC..." → every public playlist of that channel id
 * - anything else   → treated as a playlist id
 */
export async function resolvePlaylistIds(yt: youtube_v3.Youtube, entries: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry === "mine") {
      ids.push(...(await listPlaylists(yt, { mine: true })));
    } else if (entry.startsWith("@")) {
      const res = await yt.channels.list({ part: ["id"], forHandle: entry });
      const channelId = res.data.items?.[0]?.id;
      if (!channelId) throw new Error(`Channel ${entry} not found`);
      ids.push(...(await listPlaylists(yt, { channelId })));
    } else if (entry.startsWith("channel:")) {
      ids.push(...(await listPlaylists(yt, { channelId: entry.slice("channel:".length) })));
    } else {
      ids.push(entry);
    }
  }
  return [...new Set(ids)];
}

async function listPlaylists(yt: youtube_v3.Youtube, filter: { mine: true } | { channelId: string }): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await yt.playlists.list({ part: ["id"], ...filter, maxResults: 50, pageToken });
    for (const p of res.data.items ?? []) if (p.id) ids.push(p.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

/** Returns null when the playlist itself no longer exists or is not visible to us. */
export async function fetchPlaylist(yt: youtube_v3.Youtube, playlistId: string): Promise<FetchedPlaylist | null> {
  const meta = await yt.playlists.list({ part: ["snippet"], id: [playlistId] });
  const playlist = meta.data.items?.[0];
  if (!playlist) return null;

  const items: FetchedItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await yt.playlistItems.list({
      part: ["snippet", "contentDetails", "status"],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items ?? []) {
      const s = item.snippet;
      const videoId = item.contentDetails?.videoId ?? s?.resourceId?.videoId;
      if (!item.id || !videoId) continue;
      const title = s?.title ?? "";
      items.push({
        playlistItemId: item.id,
        videoId,
        title,
        channel: s?.videoOwnerChannelTitle ?? null,
        channelId: s?.videoOwnerChannelId ?? null,
        position: s?.position ?? items.length,
        addedAt: s?.publishedAt ?? null,
        // Deleted/privated videos keep their slot but lose their title and owner channel.
        unavailable: UNAVAILABLE_TITLES.has(title) || !s?.videoOwnerChannelId,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return {
    playlistId,
    title: playlist.snippet?.title ?? playlistId,
    channel: playlist.snippet?.channelTitle ?? null,
    items,
  };
}
