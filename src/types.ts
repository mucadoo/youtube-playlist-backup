export type TrackStatus = "active" | "unavailable" | "removed";

export interface Track {
  /** playlistItem id — unique per slot, so the same video added twice is tracked twice. */
  playlistItemId: string;
  videoId: string;
  title: string;
  channel: string | null;
  channelId: string | null;
  position: number;
  addedAt: string | null;
  firstSeenAt: string;
  status: TrackStatus;
  statusChangedAt: string;
}

export interface PlaylistBackup {
  playlistId: string;
  title: string;
  channel: string | null;
  updatedAt: string;
  items: Track[];
}

export interface DeletionEvent {
  detectedAt: string;
  playlistId: string;
  playlistTitle: string;
  /** unavailable = video deleted/privated but still in the playlist; removed = gone from the playlist. */
  reason: Exclude<TrackStatus, "active">;
  track: Track;
}

/** What the YouTube fetcher hands to the diff step. */
export interface FetchedItem {
  playlistItemId: string;
  videoId: string;
  title: string;
  channel: string | null;
  channelId: string | null;
  position: number;
  addedAt: string | null;
  unavailable: boolean;
}

export interface FetchedPlaylist {
  playlistId: string;
  title: string;
  channel: string | null;
  items: FetchedItem[];
}
