import { loadConfig, renderFileName } from "./config.js";
import { mergePlaylist } from "./diff.js";
import { oauthClient } from "./google-auth.js";
import { createStorage } from "./storage/index.js";
import type { DeletionEvent, PlaylistBackup } from "./types.js";
import { fetchPlaylist, resolvePlaylistIds, youtubeClient } from "./youtube.js";

const toJson = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

async function main() {
  const config = loadConfig();
  const auth = config.oauth ? oauthClient(config.oauth) : undefined;
  const yt = youtubeClient(auth ?? config.youtubeApiKey!);
  const storage = createStorage(config, auth);
  const now = new Date().toISOString();

  console.log(`Backing up to ${storage.describe()}`);
  const playlistIds = await resolvePlaylistIds(yt, config.playlistIds);
  const allEvents: DeletionEvent[] = [];
  let failures = 0;

  for (const playlistId of playlistIds) {
    try {
      const fetched = await fetchPlaylist(yt, playlistId);
      if (!fetched) {
        // Leave the existing backup untouched rather than marking everything removed.
        console.warn(`! ${playlistId}: playlist not found or not accessible, skipping`);
        failures++;
        continue;
      }
      const fileName = renderFileName(config.fileNameTemplate, { playlistId, playlistTitle: fetched.title });
      const raw = await storage.read(fileName);
      const previous = raw ? (JSON.parse(raw) as PlaylistBackup) : null;

      const { backup, events, changed } = mergePlaylist(previous, fetched, now);
      if (changed) await storage.write(fileName, toJson(backup));
      allEvents.push(...events);

      const active = backup.items.filter((t) => t.status === "active").length;
      console.log(
        `${changed ? "✓" : "="} ${fetched.title} (${playlistId}) → ${fileName}: ` +
          `${active} active, ${backup.items.length - active} gone, ${events.length} new deletions`,
      );
    } catch (err) {
      failures++;
      console.error(`✗ ${playlistId}:`, err instanceof Error ? err.message : err);
    }
  }

  if (allEvents.length > 0) {
    const raw = await storage.read(config.deletedLogFileName);
    const log = raw ? (JSON.parse(raw) as DeletionEvent[]) : [];
    await storage.write(config.deletedLogFileName, toJson([...log, ...allEvents]));
    for (const e of allEvents) {
      console.log(`  - [${e.reason}] ${e.track.title} — ${e.track.channel ?? "?"} (${e.track.videoId}) in ${e.playlistTitle}`);
    }
  }

  await storage.flush();
  console.log(`Done: ${playlistIds.length - failures}/${playlistIds.length} playlists, ${allEvents.length} new deletions.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
