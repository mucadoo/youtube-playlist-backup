import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function withEnv(vars: Record<string, string>) {
  for (const key of Object.keys(process.env)) {
    if (/^(BACKUP_|GITHUB_|GDRIVE_|GOOGLE_|YOUTUBE_|STORAGE_|PLAYLIST_|DELETED_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { YOUTUBE_API_KEY: "key", BACKUP_SOURCES: "PL1" }, vars);
  return loadConfig();
}

describe("loadConfig", () => {
  it("uses the shared folder and file name by default", () => {
    const config = withEnv({ STORAGE_BACKEND: "local", BACKUP_FOLDER: "out", BACKUP_FILE_NAME: "{kind}/{id}.json" });
    expect(config).toMatchObject({ folder: "out", fileNameTemplate: "{kind}/{id}.json" });
  });

  it("lets BACKUP_GITHUB_* override the shared settings", () => {
    const config = withEnv({
      STORAGE_BACKEND: "github",
      BACKUP_FOLDER: "shared",
      BACKUP_FILE_NAME: "{id}.json",
      BACKUP_GITHUB_FOLDER: "/",
      BACKUP_GITHUB_FILE_NAME: "{kind}/{title}.json",
      BACKUP_GITHUB_TOKEN: "t",
      BACKUP_GITHUB_REPOSITORY: "me/backups",
      BACKUP_GITHUB_BRANCH: "backups",
    });
    expect(config).toMatchObject({
      folder: "/",
      fileNameTemplate: "{kind}/{title}.json",
      github: { token: "t", repository: "me/backups", branch: "backups" },
    });
  });

  it("falls back to GITHUB_* names for local runs", () => {
    const config = withEnv({ STORAGE_BACKEND: "github", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "me/repo" });
    expect(config.github).toMatchObject({ token: "t", repository: "me/repo", branch: undefined });
    expect(config.folder).toBe("data");
  });

  it("requires a repository for the github backend", () => {
    expect(() => withEnv({ STORAGE_BACKEND: "github", BACKUP_GITHUB_TOKEN: "t" })).toThrow(/BACKUP_GITHUB_REPOSITORY/);
  });
});
