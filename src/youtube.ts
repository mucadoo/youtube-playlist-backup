import { youtube, type youtube_v3 } from "@googleapis/youtube";
import type { OAuth2Client } from "google-auth-library";
import type { Source, User, UserKind } from "./sources.js";
import type { CollectionKind, FetchedCollection, FetchedItem } from "./types.js";

const UNAVAILABLE_TITLES = new Set(["Deleted video", "Private video"]);

/** A concrete thing to back up, one per output file. */
export type CollectionRef = {
  /** Also the collection id in the backup file. */
  key: string;
  kind: CollectionKind;
  title: string;
  /** Came from a "everything for this user" entry, so a permission error just skips it. */
  implied: boolean;
} & ({ kind: "playlist" | "uploads"; playlistId: string } | { kind: "liked" } | { kind: "subscriptions"; channelId: string | null });

interface Channel {
  id: string;
  title: string;
  uploadsPlaylistId: string | null;
}

export function youtubeClient(auth: OAuth2Client | string): youtube_v3.Youtube {
  return youtube({ version: "v3", auth });
}

/** Expands sources into collections. A source that fails to resolve is reported in `failed` and skipped. */
export async function resolveSources(
  yt: youtube_v3.Youtube,
  sources: Source[],
): Promise<{ refs: CollectionRef[]; failed: { source: string; error: unknown }[] }> {
  const included = new Map<string, CollectionRef>();
  const excluded = new Set<string>();
  const failed: { source: string; error: unknown }[] = [];
  for (const source of sources) {
    let refs: CollectionRef[];
    try {
      refs = await resolveTarget(yt, source);
    } catch (error) {
      failed.push({ source: source.raw, error });
      continue;
    }
    for (const ref of refs) {
      if (source.exclude) excluded.add(ref.key);
      else if (!included.has(ref.key)) included.set(ref.key, ref);
    }
  }
  return { refs: [...included.values()].filter((ref) => !excluded.has(ref.key)), failed };
}

async function resolveTarget(yt: youtube_v3.Youtube, { target }: Source): Promise<CollectionRef[]> {
  if (target.type === "playlist") {
    return [{ key: target.playlistId, kind: "playlist", playlistId: target.playlistId, title: target.playlistId, implied: false }];
  }

  const { user } = target;
  const implied = target.kinds === null;
  const kinds: UserKind[] = target.kinds ?? (user.type === "mine" ? ["playlists", "uploads", "liked", "subscriptions"] : ["playlists", "uploads", "subscriptions"]);
  const channel = await getChannel(yt, user);
  const refs: CollectionRef[] = [];

  for (const kind of kinds) {
    switch (kind) {
      case "playlists":
        for (const id of await listPlaylistIds(yt, user.type === "mine" ? { mine: true } : { channelId: channel!.id })) {
          refs.push({ key: id, kind: "playlist", playlistId: id, title: id, implied });
        }
        break;
      case "uploads":
        if (channel?.uploadsPlaylistId) {
          refs.push({ key: channel.uploadsPlaylistId, kind: "uploads", playlistId: channel.uploadsPlaylistId, title: `Uploads from ${channel.title}`, implied });
        } else if (!implied) {
          throw new Error(`${describeUser(user)} has no channel, so there are no uploads to back up`);
        }
        break;
      case "liked":
        refs.push({ key: "liked", kind: "liked", title: "Liked videos", implied });
        break;
      case "subscriptions":
        refs.push(
          user.type === "mine"
            ? { key: "subscriptions", kind: "subscriptions", channelId: null, title: "Subscriptions", implied }
            : { key: `subscriptions-${channel!.id}`, kind: "subscriptions", channelId: channel!.id, title: `Subscriptions of ${channel!.title}`, implied },
        );
        break;
    }
  }
  return refs;
}

/** Returns null only for "mine" when the account has no YouTube channel. */
async function getChannel(yt: youtube_v3.Youtube, user: User): Promise<Channel | null> {
  const filter = user.type === "mine" ? { mine: true } : user.type === "handle" ? { forHandle: user.handle } : { id: [user.channelId] };
  const res = await yt.channels.list({ part: ["snippet", "contentDetails"], ...filter });
  const channel = res.data.items?.[0];
  if (!channel?.id) {
    if (user.type === "mine") return null;
    throw new Error(`${describeUser(user)} not found`);
  }
  return {
    id: channel.id,
    title: channel.snippet?.title ?? channel.id,
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

const describeUser = (user: User) =>
  user.type === "mine" ? "Your account" : user.type === "handle" ? `Channel ${user.handle}` : `Channel ${user.channelId}`;

async function listPlaylistIds(yt: youtube_v3.Youtube, filter: { mine: true } | { channelId: string }): Promise<string[]> {
  const ids: string[] = [];
  await paginate(async (pageToken) => {
    const res = await yt.playlists.list({ part: ["id"], ...filter, maxResults: 50, pageToken });
    for (const p of res.data.items ?? []) if (p.id) ids.push(p.id);
    return res.data.nextPageToken;
  });
  return ids;
}

async function paginate(fetchPage: (pageToken: string | undefined) => Promise<string | null | undefined>) {
  let pageToken: string | undefined;
  do pageToken = (await fetchPage(pageToken)) ?? undefined;
  while (pageToken);
}

/** Returns null when the collection itself no longer exists or is not visible to us. */
export async function fetchCollection(yt: youtube_v3.Youtube, ref: CollectionRef): Promise<FetchedCollection | null> {
  switch (ref.kind) {
    case "playlist":
    case "uploads":
      return fetchPlaylist(yt, ref.playlistId, ref.kind);
    case "liked":
      return { id: ref.key, kind: "liked", title: ref.title, owner: null, items: await fetchLiked(yt) };
    case "subscriptions":
      return { id: ref.key, kind: "subscriptions", title: ref.title, owner: null, items: await fetchSubscriptions(yt, ref.channelId) };
  }
}

async function fetchPlaylist(yt: youtube_v3.Youtube, playlistId: string, kind: "playlist" | "uploads"): Promise<FetchedCollection | null> {
  const meta = await yt.playlists.list({ part: ["snippet"], id: [playlistId] });
  const playlist = meta.data.items?.[0];
  if (!playlist) return null;

  const items: FetchedItem[] = [];
  await paginate(async (pageToken) => {
    const res = await yt.playlistItems.list({ part: ["snippet", "contentDetails"], playlistId, maxResults: 50, pageToken });
    for (const item of res.data.items ?? []) {
      const s = item.snippet;
      const videoId = item.contentDetails?.videoId ?? s?.resourceId?.videoId;
      if (!item.id || !videoId) continue;
      const title = s?.title ?? "";
      items.push({
        itemId: item.id,
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
    return res.data.nextPageToken;
  });

  return {
    id: playlistId,
    kind,
    title: playlist.snippet?.title ?? playlistId,
    owner: playlist.snippet?.channelTitle ?? null,
    items,
  };
}

/** Liked videos, newest like first. Deleted videos drop out of this list, so they show up as "removed". */
async function fetchLiked(yt: youtube_v3.Youtube): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  await paginate(async (pageToken) => {
    const res = await yt.videos.list({ part: ["snippet"], myRating: "like", maxResults: 50, pageToken });
    for (const video of res.data.items ?? []) {
      if (!video.id) continue;
      items.push({
        itemId: video.id,
        videoId: video.id,
        title: video.snippet?.title ?? "",
        channel: video.snippet?.channelTitle ?? null,
        channelId: video.snippet?.channelId ?? null,
        position: items.length,
        addedAt: null, // the API doesn't expose when a video was liked
        unavailable: false,
      });
    }
    return res.data.nextPageToken;
  });
  return items;
}

/** channelId null = the signed-in user's subscriptions. */
async function fetchSubscriptions(yt: youtube_v3.Youtube, channelId: string | null): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  await paginate(async (pageToken) => {
    const res = await yt.subscriptions.list({
      part: ["snippet"],
      ...(channelId ? { channelId } : { mine: true }),
      order: "alphabetical",
      maxResults: 50,
      pageToken,
    });
    for (const sub of res.data.items ?? []) {
      const subscribedTo = sub.snippet?.resourceId?.channelId;
      if (!subscribedTo) continue;
      items.push({
        itemId: subscribedTo,
        videoId: null,
        title: sub.snippet?.title ?? subscribedTo,
        channel: null,
        channelId: subscribedTo,
        position: items.length,
        addedAt: sub.snippet?.publishedAt ?? null,
        unavailable: false,
      });
    }
    return res.data.nextPageToken;
  });
  return items;
}
