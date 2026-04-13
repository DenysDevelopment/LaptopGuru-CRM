#!/usr/bin/env node
/**
 * Helper script to obtain a YouTube OAuth2 refresh token.
 *
 * Usage:
 *   node scripts/youtube-get-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * 1. Opens browser to Google consent screen
 * 2. User logs in and grants YouTube upload permission
 * 3. Script exchanges auth code for tokens
 * 4. Prints YOUTUBE_OAUTH_REFRESH_TOKEN to paste into .env
 */

import http from "node:http";
import { exec } from "node:child_process";

const [CLIENT_ID, CLIENT_SECRET] = process.argv.slice(2);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Usage: node scripts/youtube-get-token.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400);
    res.end("Missing code parameter");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      res.writeHead(400);
      res.end(`Error: ${tokens.error_description || tokens.error}`);
      console.error("Token error:", tokens);
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>Готово! Можешь закрыть эту вкладку.</h1>");

    console.log("\n===================================");
    console.log("Добавь в .env:");
    console.log("===================================\n");
    console.log(`YOUTUBE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`YOUTUBE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`YOUTUBE_DEFAULT_PRIVACY_STATUS=unlisted`);
    console.log("\n===================================\n");

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end("Internal error");
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nОткрой в браузере:\n\n${authUrl}\n`);
  // Try to open browser automatically
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${authUrl}"`);
});
