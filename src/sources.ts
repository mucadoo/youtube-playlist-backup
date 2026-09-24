/**
 * Parses BACKUP_SOURCES. Entries are separated by commas, spaces or newlines:
 *
 *   PLxxxxxxxx              a playlist
 *   mine                    everything on the signed-in account (playlists, uploads, liked, subscriptions)
 *   @handle | channel:UC..  everything public on that channel (playlists, uploads, subscriptions)
 *   <user>:<kind>           just one kind, e.g. mine:liked, @handle:uploads, channel:UC..:playlists
 *   !<entry>                exclude, e.g. !PLxxxxxxxx or !mine:subscriptions
 */

export const USER_KINDS = ["playlists", "uploads", "liked", "subscriptions"] as const;
export type UserKind = (typeof USER_KINDS)[number];

export type User = { type: "mine" } | { type: "handle"; handle: string } | { type: "channel"; channelId: string };

export type Target =
  | { type: "playlist"; playlistId: string }
  /** kinds === null means "everything available for this user". */
  | { type: "user"; user: User; kinds: UserKind[] | null };

export interface Source {
  exclude: boolean;
  target: Target;
  raw: string;
}

export function parseSources(value: string): Source[] {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((raw) => {
      const exclude = raw.startsWith("!");
      return { exclude, target: parseTarget(exclude ? raw.slice(1) : raw, raw), raw };
    });
}

function parseTarget(entry: string, raw: string): Target {
  let user: User;
  let rest: string[];
  if (entry === "mine" || entry.startsWith("mine:")) {
    user = { type: "mine" };
    rest = entry.split(":").slice(1);
  } else if (entry.startsWith("@")) {
    const [handle, ...r] = entry.split(":");
    user = { type: "handle", handle: handle! };
    rest = r;
  } else if (entry.startsWith("channel:")) {
    const [, channelId, ...r] = entry.split(":");
    if (!channelId) throw new Error(`Invalid source "${raw}": expected channel:<channel id>`);
    user = { type: "channel", channelId };
    rest = r;
  } else if (entry.includes(":")) {
    throw new Error(`Invalid source "${raw}"`);
  } else {
    return { type: "playlist", playlistId: entry };
  }

  if (rest.length === 0) return { type: "user", user, kinds: null };
  const kinds = rest.join(":").split("+");
  for (const kind of kinds) {
    if (!USER_KINDS.includes(kind as UserKind)) {
      throw new Error(`Invalid source "${raw}": unknown kind "${kind}" (use ${USER_KINDS.join(", ")})`);
    }
  }
  if (user.type !== "mine" && kinds.includes("liked")) {
    throw new Error(`Invalid source "${raw}": liked videos are only available for your own account (mine:liked)`);
  }
  return { type: "user", user, kinds: kinds as UserKind[] };
}

export const needsOAuth = (sources: Source[]) =>
  sources.some((s) => s.target.type === "user" && s.target.user.type === "mine");
