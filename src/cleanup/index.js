const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '90', 10);
const LOG_DIR = path.join(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `cleanup-${Date.now()}.log`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

async function main() {
  if (!FOLDER_ID) { log('ERROR: GDRIVE_FOLDER_ID not set'); process.exit(1); }
  if (RETENTION_DAYS === 0) { log('Retention disabled (0 days), skipping cleanup'); return; }

  const auth = new GoogleAuth({
    keyFile: 'credentials/google-client-secret.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  log(`Cleanup started. Retention: ${RETENTION_DAYS} days. Cutoff: ${cutoff.toISOString()}`);

  let pageToken;
  let deleted = 0;
  let kept = 0;

  do {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageToken,
      pageSize: 100,
    });

    for (const folder of res.data.files || []) {
      const created = new Date(folder.createdTime);
      if (created < cutoff) {
        log(`Deleting: ${folder.name} (created ${folder.createdTime})`);
        await drive.files.delete({ fileId: folder.id });
        deleted++;
      } else {
        log(`Keeping: ${folder.name} (created ${folder.createdTime})`);
        kept++;
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  log(`Cleanup complete. Deleted: ${deleted}, Kept: ${kept}`);
}

main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
