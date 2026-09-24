import type { OAuth2Client } from "google-auth-library";
import type { Config } from "../config.js";
import { GoogleDriveStorage } from "./gdrive.js";
import { GitHubStorage } from "./github.js";
import { LocalStorage } from "./local.js";
import type { Storage } from "./types.js";

export type { Storage };

export function createStorage(config: Config, auth: OAuth2Client | undefined): Storage {
  switch (config.backend) {
    case "gdrive":
      return new GoogleDriveStorage(auth!, config.folder, config.gdrive.parentFolderId);
    case "github": {
      const { token, repository, branch, commitMessage } = config.github;
      return new GitHubStorage(token, repository, branch, config.folder, commitMessage);
    }
    case "local":
      return new LocalStorage(config.folder);
  }
}
