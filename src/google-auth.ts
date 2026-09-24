import { OAuth2Client } from "google-auth-library";
import type { Config } from "./config.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  // Only files/folders this app created are visible — see README.
  "https://www.googleapis.com/auth/drive.file",
];

export function oauthClient(oauth: NonNullable<Config["oauth"]>): OAuth2Client {
  const client = new OAuth2Client({ clientId: oauth.clientId, clientSecret: oauth.clientSecret });
  client.setCredentials({ refresh_token: oauth.refreshToken });
  return client;
}
