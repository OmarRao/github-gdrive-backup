/**
 * Run this script once to authorise Google Drive access.
 * It opens a browser URL, you paste back the code, and the token is saved.
 *
 * Usage:  node src/auth/google-auth.js
 */
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const SECRET_PATH = process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json';
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json';

(async () => {
  if (!fs.existsSync(SECRET_PATH)) {
    console.error(`Client secret not found at ${SECRET_PATH}`);
    console.error('Download it from Google Cloud Console → APIs & Services → Credentials');
    process.exit(1);
  }

  const secret = JSON.parse(fs.readFileSync(SECRET_PATH));
  const { client_id, client_secret, redirect_uris } = secret.installed || secret.web;
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, (redirect_uris || ['http://localhost'])[0]);

  const authUrl = oAuth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\nOpen this URL in your browser and authorise the app:\n');
  console.log(authUrl);
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the authorisation code here: ', async (code) => {
    rl.close();
    const { tokens } = await oAuth2.getToken(code.trim());
    oAuth2.setCredentials(tokens);
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log(`\nToken saved to ${TOKEN_PATH}`);
    console.log('You can now run backups.');
  });
})();
