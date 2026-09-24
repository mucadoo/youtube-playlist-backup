import type { DeletionEvent, FetchedPlaylist, PlaylistBackup, Track } from "./types.js";

export interface MergeResult {
  backup: PlaylistBackup;
  events: DeletionEvent[];
  changed: boolean;
}

/**
 * Merges a fresh fetch into the previous backup. Records are never dropped: a video that
 * disappears from the playlist is kept as "removed", and one YouTube wiped keeps its last
 * known title/channel as "unavailable".
 */
export function mergePlaylist(previous: PlaylistBackup | null, fetched: FetchedPlaylist, now: string): MergeResult {
  const prevById = new Map((previous?.items ?? []).map((t) => [t.playlistItemId, t]));
  const events: DeletionEvent[] = [];
  const next: Track[] = [];

  const flag = (track: Track) => {
    if (track.status === "active") return;
    events.push({
      detectedAt: now,
      playlistId: fetched.playlistId,
      playlistTitle: fetched.title,
      reason: track.status,
      track,
    });
  };

  for (const item of fetched.items) {
    const prev = prevById.get(item.playlistItemId);
    prevById.delete(item.playlistItemId);
    const status = item.unavailable ? "unavailable" : "active";

    // Keep the last good metadata when YouTube replaces it with "Deleted video".
    const keepOld = item.unavailable && prev;
    const track: Track = {
      playlistItemId: item.playlistItemId,
      videoId: item.videoId,
      title: keepOld ? prev.title : item.title,
      channel: keepOld ? prev.channel : item.channel,
      channelId: keepOld ? prev.channelId : item.channelId,
      position: item.position,
      addedAt: item.addedAt ?? prev?.addedAt ?? null,
      firstSeenAt: prev?.firstSeenAt ?? now,
      status,
      statusChangedAt: prev && prev.status === status ? prev.statusChangedAt : now,
    };
    next.push(track);
    // Only log transitions away from active; a track first seen already deleted has nothing worth saving.
    if (prev?.status === "active" && status !== "active") flag(track);
  }

  for (const prev of prevById.values()) {
    if (prev.status === "removed") {
      next.push(prev);
      continue;
    }
    const track: Track = { ...prev, status: "removed", statusChangedAt: now };
    next.push(track);
    flag(track);
  }

  // Current items in playlist order, then removed ones by when they disappeared.
  next.sort((a, b) => {
    const ar = a.status === "removed", br = b.status === "removed";
    if (ar !== br) return ar ? 1 : -1;
    if (ar) return a.statusChangedAt.localeCompare(b.statusChangedAt) || a.position - b.position;
    return a.position - b.position;
  });

  const candidate: PlaylistBackup = {
    playlistId: fetched.playlistId,
    title: fetched.title,
    channel: fetched.channel,
    updatedAt: previous?.updatedAt ?? now,
    items: next,
  };
  const changed = !previous || JSON.stringify({ ...candidate, updatedAt: "" }) !== JSON.stringify({ ...previous, updatedAt: "" });
  if (changed) candidate.updatedAt = now;

  return { backup: candidate, events, changed };
}
