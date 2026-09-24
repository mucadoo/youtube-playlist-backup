export type ItemStatus = "active" | "unavailable" | "removed";

/** What a backup file holds: a playlist, a channel's uploads, liked videos or subscriptions. */
export type CollectionKind = "playlist" | "uploads" | "liked" | "subscriptions";

export interface BackupItem {
  /** Stable key within the collection: playlistItem id, video id (liked) or channel id (subscriptions). */
  itemId: string;
  /** null for subscriptions. */
  videoId: string | null;
  title: string;
  channel: string | null;
  channelId: string | null;
  position: number;
  addedAt: string | null;
  firstSeenAt: string;
  status: ItemStatus;
  statusChangedAt: string;
}

export interface CollectionBackup {
  id: string;
  kind: CollectionKind;
  title: string;
  owner: string | null;
  updatedAt: string;
  items: BackupItem[];
}

/** An item that stopped being active during this run. Only reported in the run log; the backup file's status fields hold the record. */
export interface StatusChange {
  detectedAt: string;
  collectionId: string;
  collectionKind: CollectionKind;
  collectionTitle: string;
  /** unavailable = video deleted/privated but still listed; removed = gone from the collection. */
  reason: Exclude<ItemStatus, "active">;
  item: BackupItem;
}

/** What the YouTube fetcher hands to the diff step. */
export interface FetchedItem {
  itemId: string;
  videoId: string | null;
  title: string;
  channel: string | null;
  channelId: string | null;
  position: number;
  addedAt: string | null;
  unavailable: boolean;
}

export interface FetchedCollection {
  id: string;
  kind: CollectionKind;
  title: string;
  owner: string | null;
  items: FetchedItem[];
}
