import { needsOAuth, parseSources } from "./sources.js";
import type { CollectionKind } from "./types.js";

export type StorageBackend = "gdrive" | "github" | "local";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig() {
  const backend = (env("STORAGE_BACKEND") ?? "gdrive") as StorageBackend;
  if (!["gdrive", "github", "local"].includes(backend)) {
    throw new Error(`STORAGE_BACKEND must be gdrive, github or local (got "${backend}")`);
  }

  const oauth =
    env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && env("GOOGLE_REFRESH_TOKEN")
      ? {
          clientId: required("GOOGLE_CLIENT_ID"),
          clientSecret: required("GOOGLE_CLIENT_SECRET"),
          refreshToken: required("GOOGLE_REFRESH_TOKEN"),
        }
      : undefined;
  const youtubeApiKey = env("YOUTUBE_API_KEY");

  if (!oauth && !youtubeApiKey) {
    throw new Error("Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN or YOUTUBE_API_KEY");
  }
  if (backend === "gdrive" && !oauth) {
    throw new Error("The gdrive backend needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN");
  }

  // PLAYLIST_IDS is the old name, still accepted.
  const sources = parseSources(env("BACKUP_SOURCES") ?? env("PLAYLIST_IDS") ?? "");
  if (!sources.some((s) => !s.exclude)) throw new Error("BACKUP_SOURCES is empty");
  if (needsOAuth(sources) && !oauth) {
    throw new Error('"mine" sources require OAuth credentials (an API key cannot see your account)');
  }

  // BACKUP_GDRIVE_FOLDER, BACKUP_GITHUB_FILE_NAME, ... override the shared BACKUP_FOLDER / BACKUP_FILE_NAME.
  const prefix = backend.toUpperCase();
  const perBackend = (name: string) => env(`BACKUP_${prefix}_${name}`) ?? env(`BACKUP_${name}`);
  const githubVar = (name: string, isRequired = false) => {
    const value = env(`BACKUP_GITHUB_${name}`) ?? env(`GITHUB_${name}`);
    if (isRequired && !value) throw new Error(`Missing required environment variable BACKUP_GITHUB_${name}`);
    return value;
  };

  return {
    backend,
    sources,
    youtubeApiKey,
    oauth,
    /** Folder the backup files go into. A "/"-separated path, created if missing; "/" means the top level. */
    folder: perBackend("FOLDER") ?? (backend === "gdrive" ? "YouTube Playlist Backup" : "data"),
    /** Per-collection file name. Supports {id}, {title} and {kind}; may contain "/" for subfolders. */
    fileNameTemplate: perBackend("FILE_NAME") ?? "{id}.json",
    gdrive: {
      parentFolderId: env("GDRIVE_PARENT_FOLDER_ID") ?? "root",
    },
    // BACKUP_GITHUB_* names work in Actions, where GITHUB_* secrets/variables are reserved.
    github: {
      token: backend === "github" ? githubVar("TOKEN", true)! : "",
      repository: backend === "github" ? githubVar("REPOSITORY", true)! : "",
      /** Created (as a branch holding only the backups) if it doesn't exist. Default: the repo's default branch. */
      branch: githubVar("BRANCH"),
      commitMessage: githubVar("COMMIT_MESSAGE") ?? "chore: update playlist backup",
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;

export function renderFileName(template: string, vars: { id: string; title: string; kind: CollectionKind }): string {
  const safeTitle = vars.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim() || vars.id;
  return (
    template
      .replaceAll("{id}", vars.id)
      .replaceAll("{title}", safeTitle)
      .replaceAll("{kind}", vars.kind)
      // Old placeholder names.
      .replaceAll("{playlistId}", vars.id)
      .replaceAll("{playlistTitle}", safeTitle)
  );
}
