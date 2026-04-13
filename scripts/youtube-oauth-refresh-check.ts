import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing YouTube OAuth env vars');
  process.exit(1);
}

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
client.setCredentials({ refresh_token: REFRESH_TOKEN });

try {
  await client.getAccessToken();
  const yt = google.youtube({ version: 'v3', auth: client });
  await yt.channels.list({ part: ['snippet'], mine: true });
  console.log('YouTube OAuth OK');
} catch (err) {
  console.error('YouTube OAuth FAILED:', err);
  process.exit(1);
}
