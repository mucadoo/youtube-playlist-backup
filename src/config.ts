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

  const playlistIds = (env("PLAYLIST_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (playlistIds.length === 0) throw new Error("PLAYLIST_IDS is empty");
  if (playlistIds.includes("mine") && !oauth) {
    throw new Error('PLAYLIST_IDS=mine requires OAuth credentials (an API key cannot see your account)');
  }

  return {
    backend,
    playlistIds,
    youtubeApiKey,
    oauth,
    /** Folder the backup files go into. A "/"-separated path; created if missing. */
    folder: env("BACKUP_FOLDER") ?? (backend === "gdrive" ? "YouTube Playlist Backup" : "data"),
    /** Per-playlist file name. Supports {playlistId} and {playlistTitle}. */
    fileNameTemplate: env("BACKUP_FILE_NAME") ?? "{playlistId}.json",
    deletedLogFileName: env("DELETED_LOG_FILE_NAME") ?? "deleted_tracks.json",
    gdrive: {
      parentFolderId: env("GDRIVE_PARENT_FOLDER_ID") ?? "root",
    },
    github: {
      token: backend === "github" ? required("GITHUB_TOKEN") : "",
      repository: backend === "github" ? required("GITHUB_REPOSITORY") : "",
      branch: env("GITHUB_BRANCH"),
      commitMessage: env("GITHUB_COMMIT_MESSAGE") ?? "chore: update playlist backup",
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;

export function renderFileName(template: string, vars: { playlistId: string; playlistTitle: string }): string {
  const safeTitle = vars.playlistTitle.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim() || vars.playlistId;
  return template.replaceAll("{playlistId}", vars.playlistId).replaceAll("{playlistTitle}", safeTitle);
}
