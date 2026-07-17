// Copyright (c) Omar Rao. All rights reserved.
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

/**
 * Pure retention planner — decides which sessions to delete without touching
 * the network, so it is fully unit-testable.
 *
 * A session older than the cutoff is deleted ONLY if no *retained* session's
 * delta chain still depends on it. This prevents age-based cleanup from
 * silently orphaning a base or intermediate bundle that a kept session needs
 * to restore (the delta-chain data-loss hazard).
 *
 * @param {Array<{name:string, createdTime:string}>} sessions
 * @param {Date} cutoff  Sessions created before this are deletion candidates.
 * @param {Object<string,string[]>} chainDeps  session name -> the chain session
 *        names it depends on (union across all its repos). Sessions using full
 *        zip archives simply have no entry (or an empty array).
 * @returns {{toDelete:string[], toKeep:string[], protectedOld:string[]}}
 */
function planCleanup(sessions, cutoff, chainDeps = {}) {
  const kept = sessions.filter(s => new Date(s.createdTime) >= cutoff);

  // Everything a retained session needs to restore must survive.
  const protectedSet = new Set();
  for (const s of kept) {
    protectedSet.add(s.name);
    for (const dep of chainDeps[s.name] || []) protectedSet.add(dep);
  }

  const toDelete = [];
  const toKeep = [];
  const protectedOld = [];
  for (const s of sessions) {
    const old = new Date(s.createdTime) < cutoff;
    if (!old) { toKeep.push(s.name); continue; }
    if (protectedSet.has(s.name)) { protectedOld.push(s.name); toKeep.push(s.name); }
    else toDelete.push(s.name);
  }
  return { toDelete, toKeep, protectedOld };
}

/** Download a Drive file's text content via googleapis. */
async function readFileText(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

/**
 * Build chainDeps for the retained sessions by reading each repo's
 * backup-state.json. Only inspects sessions newer than the cutoff (the ones
 * whose restorability we must protect) to bound API calls.
 */
async function buildChainDeps(drive, sessions, cutoff) {
  const chainDeps = {};
  const kept = sessions.filter(s => new Date(s.createdTime) >= cutoff);
  for (const s of kept) {
    const deps = new Set();
    const sub = await drive.files.list({
      q: `'${s.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)', pageSize: 1000,
    });
    for (const repo of sub.data.files || []) {
      const files = await drive.files.list({
        q: `'${repo.id}' in parents and name='backup-state.json' and trashed=false`,
        fields: 'files(id, name)', pageSize: 1,
      });
      const stateFile = (files.data.files || [])[0];
      if (!stateFile) continue;
      try {
        const state = JSON.parse(await readFileText(drive, stateFile.id));
        (state.chain || []).forEach(c => deps.add(c));
      } catch (e) {
        log(`WARN: could not parse backup-state.json in ${s.name}/${repo.name}: ${e.message}`);
      }
    }
    chainDeps[s.name] = [...deps];
  }
  return chainDeps;
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

  // Gather all sessions first (needed for chain-dependency analysis).
  const sessions = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageToken,
      pageSize: 100,
    });
    (res.data.files || []).forEach(f => sessions.push(f));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  // Protect delta-chain dependencies of retained sessions.
  const chainDeps = await buildChainDeps(drive, sessions, cutoff);
  const plan = planCleanup(sessions, cutoff, chainDeps);
  const idByName = Object.fromEntries(sessions.map(s => [s.name, s.id]));

  if (plan.protectedOld.length) {
    log(`Protected ${plan.protectedOld.length} old session(s) required by live delta chains: ${plan.protectedOld.join(', ')}`);
  }

  let deleted = 0;
  for (const name of plan.toDelete) {
    log(`Deleting: ${name}`);
    await drive.files.delete({ fileId: idByName[name] });
    deleted++;
  }

  log(`Cleanup complete. Deleted: ${deleted}, Kept: ${plan.toKeep.length} (incl. ${plan.protectedOld.length} chain-protected)`);
}

if (require.main === module) {
  main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
}

module.exports = { planCleanup, buildChainDeps };
