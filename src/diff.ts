import type { BackupItem, CollectionBackup, StatusChange, FetchedCollection } from "./types.js";

export interface MergeResult {
  backup: CollectionBackup;
  events: StatusChange[];
  changed: boolean;
}

/**
 * Merges a fresh fetch into the previous backup. Records are never dropped: an item that
 * disappears is kept as "removed", and a video YouTube wiped keeps its last known
 * title/channel as "unavailable".
 */
export function mergeCollection(previous: CollectionBackup | null, fetched: FetchedCollection, now: string): MergeResult {
  const prevById = new Map((previous?.items ?? []).map((t) => [t.itemId, t]));
  const events: StatusChange[] = [];
  const next: BackupItem[] = [];

  const flag = (item: BackupItem) => {
    if (item.status === "active") return;
    events.push({
      detectedAt: now,
      collectionId: fetched.id,
      collectionKind: fetched.kind,
      collectionTitle: fetched.title,
      reason: item.status,
      item,
    });
  };

  for (const fetchedItem of fetched.items) {
    const prev = prevById.get(fetchedItem.itemId);
    prevById.delete(fetchedItem.itemId);
    const status = fetchedItem.unavailable ? "unavailable" : "active";

    // Keep the last good metadata when YouTube replaces it with "Deleted video".
    const keepOld = fetchedItem.unavailable && prev;
    const item: BackupItem = {
      itemId: fetchedItem.itemId,
      videoId: fetchedItem.videoId,
      title: keepOld ? prev.title : fetchedItem.title,
      channel: keepOld ? prev.channel : fetchedItem.channel,
      channelId: keepOld ? prev.channelId : fetchedItem.channelId,
      position: fetchedItem.position,
      addedAt: fetchedItem.addedAt ?? prev?.addedAt ?? null,
      firstSeenAt: prev?.firstSeenAt ?? now,
      status,
      statusChangedAt: prev && prev.status === status ? prev.statusChangedAt : now,
    };
    next.push(item);
    // Only log transitions away from active; an item first seen already deleted has nothing worth saving.
    if (prev?.status === "active" && status !== "active") flag(item);
  }

  for (const prev of prevById.values()) {
    if (prev.status === "removed") {
      next.push(prev);
      continue;
    }
    const item: BackupItem = { ...prev, status: "removed", statusChangedAt: now };
    next.push(item);
    flag(item);
  }

  // Current items in order, then removed ones by when they disappeared.
  next.sort((a, b) => {
    const ar = a.status === "removed", br = b.status === "removed";
    if (ar !== br) return ar ? 1 : -1;
    if (ar) return a.statusChangedAt.localeCompare(b.statusChangedAt) || a.position - b.position;
    return a.position - b.position;
  });

  const candidate: CollectionBackup = {
    id: fetched.id,
    kind: fetched.kind,
    title: fetched.title,
    owner: fetched.owner,
    updatedAt: previous?.updatedAt ?? now,
    items: next,
  };
  const changed = !previous || JSON.stringify({ ...candidate, updatedAt: "" }) !== JSON.stringify({ ...previous, updatedAt: "" });
  if (changed) candidate.updatedAt = now;

  return { backup: candidate, events, changed };
}
