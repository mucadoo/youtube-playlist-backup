import { describe, expect, it } from "vitest";
import { needsOAuth, parseSources } from "../src/sources.js";

describe("parseSources", () => {
  it("parses every form, split by commas, spaces or newlines", () => {
    const sources = parseSources("PL1, mine\n@artist:uploads+playlists  channel:UC123:subscriptions !PL2 !mine:liked");
    expect(sources.map((s) => [s.exclude, s.target])).toEqual([
      [false, { type: "playlist", playlistId: "PL1" }],
      [false, { type: "user", user: { type: "mine" }, kinds: null }],
      [false, { type: "user", user: { type: "handle", handle: "@artist" }, kinds: ["uploads", "playlists"] }],
      [false, { type: "user", user: { type: "channel", channelId: "UC123" }, kinds: ["subscriptions"] }],
      [true, { type: "playlist", playlistId: "PL2" }],
      [true, { type: "user", user: { type: "mine" }, kinds: ["liked"] }],
    ]);
  });

  it("rejects unknown kinds and liked videos of other users", () => {
    expect(() => parseSources("mine:history")).toThrow(/unknown kind "history"/);
    expect(() => parseSources("@artist:liked")).toThrow(/only available for your own account/);
    expect(() => parseSources("channel:")).toThrow(/channel:<channel id>/);
  });

  it("knows when OAuth is required", () => {
    expect(needsOAuth(parseSources("PL1 @artist"))).toBe(false);
    expect(needsOAuth(parseSources("PL1 mine:liked"))).toBe(true);
  });
});
