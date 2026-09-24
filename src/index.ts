import { loadConfig, renderFileName } from "./config.js";
import { mergeCollection } from "./diff.js";
import { oauthClient } from "./google-auth.js";
import { createStorage } from "./storage/index.js";
import type { CollectionBackup, StatusChange } from "./types.js";
import { fetchCollection, resolveSources, youtubeClient } from "./youtube.js";

const toJson = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isForbidden = (err: unknown) => {
  const e = err as { status?: number; response?: { status?: number } };
  return (e.status ?? e.response?.status) === 403;
};

async function main() {
  const config = loadConfig();
  const auth = config.oauth ? oauthClient(config.oauth) : undefined;
  const yt = youtubeClient(auth ?? config.youtubeApiKey!);
  const storage = createStorage(config, auth);
  const now = new Date().toISOString();

  console.log(`Backing up to ${storage.describe()}`);
  const { refs, failed } = await resolveSources(yt, config.sources);
  for (const { source, error } of failed) console.error(`✗ ${source}:`, errorMessage(error));
  const allEvents: StatusChange[] = [];
  let done = 0;
  let failures = failed.length;

  for (const ref of refs) {
    try {
      const fetched = await fetchCollection(yt, ref);
      if (!fetched) {
        // Leave the existing backup untouched rather than marking everything removed.
        console.warn(`! ${ref.key}: not found or not accessible, skipping`);
        failures++;
        continue;
      }
      const fileName = renderFileName(config.fileNameTemplate, fetched);
      const raw = await storage.read(fileName);
      const previous = raw ? (JSON.parse(raw) as CollectionBackup) : null;

      const { backup, events, changed } = mergeCollection(previous, fetched, now);
      if (changed) await storage.write(fileName, toJson(backup));
      allEvents.push(...events);
      done++;

      const active = backup.items.filter((t) => t.status === "active").length;
      console.log(
        `${changed ? "✓" : "="} [${fetched.kind}] ${fetched.title} (${fetched.id}) → ${fileName}: ` +
          `${active} active, ${backup.items.length - active} gone, ${events.length} new deletions`,
      );
    } catch (err) {
      // e.g. a channel's subscriptions are private: expected when backing up "everything" of someone else.
      if (ref.implied && isForbidden(err)) {
        console.log(`- [${ref.kind}] ${ref.title}: not public, skipping`);
        continue;
      }
      failures++;
      console.error(`✗ [${ref.kind}] ${ref.title}:`, errorMessage(err));
    }
  }

  if (allEvents.length > 0) {
    console.log("Newly gone:");
    for (const e of allEvents) {
      console.log(`  - [${e.reason}] ${e.item.title} — ${e.item.channel ?? "?"} (${e.item.videoId ?? e.item.itemId}) in ${e.collectionTitle}`);
    }
  }

  await storage.flush();
  console.log(`Done: ${done} backed up, ${failures} failed, ${allEvents.length} new deletions.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(errorMessage(err));
  process.exit(1);
});
