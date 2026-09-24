/**
 * One-off helper: runs the OAuth consent flow locally and prints a refresh token
 * to store as GOOGLE_REFRESH_TOKEN. Needs a "Desktop app" OAuth client.
 */
import { createServer } from "node:http";
import { OAuth2Client } from "google-auth-library";
import { SCOPES } from "./google-auth.js";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (e.g. in .env) first.");
  process.exit(1);
}

const server = createServer();
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as { port: number };
  const redirectUri = `http://127.0.0.1:${port}`;
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
  console.log(`Open this URL in your browser:\n\n${url}\n`);

  server.on("request", async (req, res) => {
    const code = new URL(req.url ?? "/", redirectUri).searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Missing ?code");
      return;
    }
    try {
      const { tokens } = await client.getToken(code);
      res.end("Authorized — you can close this tab.");
      if (!tokens.refresh_token) throw new Error("No refresh token returned; revoke the app's access and retry.");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } catch (err) {
      res.writeHead(500).end("Token exchange failed, see terminal.");
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
});
