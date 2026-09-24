import { describe, expect, it } from "vitest";
import { renderFileName } from "../src/config.js";
import { mergeCollection } from "../src/diff.js";
import type { FetchedCollection, FetchedItem } from "../src/types.js";

const item = (n: number, overrides: Partial<FetchedItem> = {}): FetchedItem => ({
  itemId: `pi${n}`,
  videoId: `v${n}`,
  title: `Song ${n}`,
  channel: `Artist ${n}`,
  channelId: `UC${n}`,
  position: n,
  addedAt: "2024-01-01T00:00:00Z",
  unavailable: false,
  ...overrides,
});
const playlist = (items: FetchedItem[]): FetchedCollection => ({ id: "PL1", kind: "playlist", title: "Mix", owner: "me", items });

describe("mergeCollection", () => {
  const t0 = "2026-01-01T00:00:00.000Z";
  const t1 = "2026-01-02T00:00:00.000Z";
  const t2 = "2026-01-03T00:00:00.000Z";

  it("creates a fresh backup with no events", () => {
    const { backup, events, changed } = mergeCollection(null, playlist([item(0), item(1)]), t0);
    expect(changed).toBe(true);
    expect(events).toEqual([]);
    expect(backup.items.map((t) => t.status)).toEqual(["active", "active"]);
  });

  it("reports unchanged when nothing moved", () => {
    const first = mergeCollection(null, playlist([item(0)]), t0).backup;
    const { changed, backup } = mergeCollection(first, playlist([item(0)]), t1);
    expect(changed).toBe(false);
    expect(backup.updatedAt).toBe(t0);
  });

  it("keeps last known metadata when a video becomes unavailable", () => {
    const first = mergeCollection(null, playlist([item(0), item(1)]), t0).backup;
    const wiped = item(1, { title: "Deleted video", channel: null, channelId: null, unavailable: true });
    const { backup, events } = mergeCollection(first, playlist([item(0), wiped]), t1);

    expect(backup.items[1]).toMatchObject({ title: "Song 1", channel: "Artist 1", status: "unavailable", statusChangedAt: t1 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: "unavailable", item: { videoId: "v1", title: "Song 1" } });

    // No duplicate event on the next run.
    const again = mergeCollection(backup, playlist([item(0), wiped]), t2);
    expect(again.events).toEqual([]);
    expect(again.changed).toBe(false);
  });

  it("keeps removed items as records and logs them once", () => {
    const first = mergeCollection(null, playlist([item(0), item(1), item(2)]), t0).backup;
    const { backup, events } = mergeCollection(first, playlist([item(0), item(2, { position: 1 })]), t1);

    expect(backup.items.map((t) => [t.videoId, t.status])).toEqual([
      ["v0", "active"],
      ["v2", "active"],
      ["v1", "removed"],
    ]);
    expect(events).toEqual([expect.objectContaining({ reason: "removed", item: expect.objectContaining({ videoId: "v1" }) })]);
    expect(mergeCollection(backup, playlist([item(0), item(2, { position: 1 })]), t2).events).toEqual([]);
  });

  it("does not log items that were already unavailable when first seen", () => {
    const { events, backup } = mergeCollection(null, playlist([item(0, { title: "Private video", unavailable: true })]), t0);
    expect(events).toEqual([]);
    expect(backup.items[0]?.status).toBe("unavailable");
  });
});

describe("renderFileName", () => {
  it("fills placeholders, sanitizes titles and allows subfolders", () => {
    expect(renderFileName("{kind}/{title} ({id}).json", { id: "PL1", title: "Rock/Metal: best", kind: "playlist" })).toBe(
      "playlist/Rock_Metal_ best (PL1).json",
    );
  });

  it("still accepts the old placeholder names", () => {
    expect(renderFileName("{playlistId}.json", { id: "PL1", title: "x", kind: "playlist" })).toBe("PL1.json");
  });
});
