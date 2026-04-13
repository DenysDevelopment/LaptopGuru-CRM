import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import * as url from 'url';
import { exec } from 'child_process';

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET in .env');
  process.exit(1);
}

const REDIRECT = 'http://localhost:8765/callback';
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  scope: [SCOPE],
  prompt: 'consent',
});

console.log('Opening browser for YouTube OAuth authorization...');
exec(`open "${authUrl}"`);

const server = http.createServer(async (req, res) => {
  const query = url.parse(req.url!, true).query;
  if (query.code) {
    try {
      const { tokens } = await client.getToken(query.code as string);
      console.log('\nSuccess! Add to .env:');
      console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Success!</h1><p>Check your terminal for the refresh token.</p>');
    } catch (err) {
      console.error('Failed to get token:', err);
      res.writeHead(500);
      res.end('Error — check terminal');
    }
    setTimeout(() => server.close(), 1000);
  }
});

server.listen(8765, () => {
  console.log('Waiting for OAuth callback on http://localhost:8765 ...');
});
