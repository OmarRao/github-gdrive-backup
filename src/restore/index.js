// Copyright (c) Omar Rao. All rights reserved.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const extractZip = require('extract-zip');
const simpleGit = require('simple-git');
const GoogleDriveClient = require('../backup/gdrive');
const { getProvider } = require('./providers');
const incremental = require('../backup/incremental');
const logger = require('../logger');

const TMP = path.resolve(process.env.BACKUP_TMP_DIR || './tmp');

async function decryptFile(encPath, zipPath) {
  const encData = fs.readFileSync(encPath);
  const iv = encData.slice(0, 16);
  const ciphertext = encData.slice(16);
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(zipPath, decrypted);
}

async function downloadAndVerify(drive, file, destPath, manifestHashes) {
  await drive.downloadFile(file.id, destPath);

  if (manifestHashes && manifestHashes[file.name]) {
    const expected = manifestHashes[file.name];
    const content = fs.readFileSync(destPath);
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== expected) {
      logger.warn(`Hash mismatch for ${file.name}: expected ${expected}, got ${actual}`);
    } else {
      logger.info(`Hash verified for ${file.name}`);
    }
  }
}

async function loadManifest(drive, files) {
  const manifestFile = files.find(f => f.name === 'manifest.json');
  if (!manifestFile) return null;

  const manifestTmp = path.join(TMP, `manifest-${Date.now()}.json`);
  try {
    await drive.downloadFile(manifestFile.id, manifestTmp);
    const manifest = JSON.parse(fs.readFileSync(manifestTmp, 'utf8'));
    fs.rmSync(manifestTmp, { force: true });
    // manifest expected to be { "filename.zip": "sha256hex", ... }
    return manifest;
  } catch (err) {
    logger.warn(`Could not load manifest.json: ${err.message}`);
    fs.rmSync(manifestTmp, { force: true });
    return null;
  }
}

/** Download a bundle file, decrypting a .enc archive if needed. Returns local path. */
async function fetchBundle(drive, bundleFile, destBase) {
  const isEnc = bundleFile.name.endsWith('.enc');
  const dlPath = `${destBase}${isEnc ? '.bundle.enc' : '.bundle'}`;
  await drive.downloadFile(bundleFile.id, dlPath);
  if (!isEnc) return dlPath;
  const decPath = `${destBase}.bundle`;
  await decryptFile(dlPath, decPath);
  fs.rmSync(dlPath, { force: true });
  return decPath;
}

/**
 * Reconstruct a mirror repo from a delta bundle chain. Reads backup-state.json
 * in the selected session's repo folder for the chain (session names, oldest
 * first), collects each session's bundle for this repo, and applies them in
 * order. Falls back to treating a lone bundle as a self-contained full bundle.
 * @returns {Promise<string>} path to the reconstructed mirror repo
 */
async function reconstructFromChain(drive, ctx, repoName, repoFiles) {
  const stateFile = repoFiles.find(f => f.name === 'backup-state.json');
  const localBundles = [];
  const cleanup = [];

  let chain = null;
  if (stateFile) {
    const stateTmp = path.join(TMP, `state-${Date.now()}.json`);
    await drive.downloadFile(stateFile.id, stateTmp);
    const state = JSON.parse(fs.readFileSync(stateTmp, 'utf8'));
    fs.rmSync(stateTmp, { force: true });
    chain = Array.isArray(state.chain) && state.chain.length ? state.chain : null;
  }

  if (chain && ctx && ctx.sessionsByName) {
    for (const sessName of chain) {
      const sessId = ctx.sessionsByName[sessName];
      if (!sessId) throw new Error(`Chain session "${sessName}" not found in Drive — cannot reconstruct ${repoName}`);
      const repoFolder = (await drive.listFolderContents(sessId))
        .find(f => f.name === repoName && f.mimeType === 'application/vnd.google-apps.folder');
      if (!repoFolder) throw new Error(`Repo "${repoName}" missing from chain session "${sessName}"`);
      const files = await drive.listFolderContents(repoFolder.id);
      const bundleFile = files.find(f => f.name.endsWith('.bundle') || f.name.endsWith('.bundle.enc'));
      if (!bundleFile) throw new Error(`Bundle for "${repoName}" missing in chain session "${sessName}"`);
      const local = await fetchBundle(drive, bundleFile, path.join(TMP, `${repoName}-${sessName}`));
      localBundles.push(local);
      cleanup.push(local);
    }
  } else {
    // No chain metadata — treat the current folder's bundle as a full bundle.
    const bundleFile = repoFiles.find(f => f.name.endsWith('.bundle') || f.name.endsWith('.bundle.enc'));
    const local = await fetchBundle(drive, bundleFile, path.join(TMP, `${repoName}-only`));
    localBundles.push(local);
    cleanup.push(local);
  }

  const mirrorDir = path.join(TMP, `${repoName}-mirror-${Date.now()}`);
  incremental.reconstruct(localBundles[0], localBundles.slice(1), mirrorDir);
  cleanup.forEach(f => fs.rmSync(f, { force: true }));
  logger.info(`Reconstructed ${repoName} from ${localBundles.length} bundle(s)`);
  return mirrorDir;
}

/** Parse `sha\tref` lines from git ls-remote / show-ref output into a map. */
function parseRefLines(text) {
  const map = {};
  (text || '').split('\n').filter(Boolean).forEach(line => {
    const [sha, ref] = line.split(/\s+/);
    if (sha && ref) map[ref] = sha;
  });
  return map;
}

/**
 * Deliver a reconstructed/extracted git repo to the destination and verify it.
 * Push mode: add remote, force-push all branches + tags, then compare the
 * destination's refs (git ls-remote) against the local source refs.
 * Local mode: copy the bare mirror to <localDest>/<repo>.git and verify on disk.
 *
 * @returns {Promise<{verified:boolean, refs:number, mismatches:string[]}>}
 */
async function deliverGit(provider, repoDir, targetOwner, repoName) {
  const localRefs = incremental.readRefs(repoDir);
  const heads = Object.keys(localRefs).filter(r => r.startsWith('refs/heads/') || r.startsWith('refs/tags/'));

  if (provider.id === 'local') {
    const destBase = provider.localDest;
    fs.mkdirSync(destBase, { recursive: true });
    const dest = path.join(destBase, `${repoName}.git`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(repoDir, dest, { recursive: true });
    const destRefs = incremental.readRefs(dest);
    const mismatches = heads.filter(r => destRefs[r] !== localRefs[r]);
    logger.info(`Saved ${repoName} → ${dest} (${heads.length} refs, ${mismatches.length ? mismatches.length + ' mismatch' : 'verified'})`);
    return { verified: mismatches.length === 0, refs: heads.length, mismatches };
  }

  const remoteUrl = provider.remoteUrl(targetOwner, repoName);
  await simpleGit(repoDir).addRemote('target', remoteUrl).catch(() => {});
  await simpleGit(repoDir).push('target', '--all', ['--force']);
  await simpleGit(repoDir).push('target', '--tags', ['--force']);

  // Post-restore verification: confirm the destination's tips match the source.
  let mismatches = heads;
  try {
    const remoteText = await simpleGit(repoDir).listRemote(['target']);
    const remoteRefs = parseRefLines(remoteText);
    mismatches = heads.filter(r => remoteRefs[r] !== localRefs[r]);
    if (mismatches.length) logger.warn(`Post-restore verification: ${mismatches.length}/${heads.length} refs differ on ${targetOwner}/${repoName}`);
    else logger.info(`Post-restore verified: ${heads.length} refs match on ${targetOwner}/${repoName}`);
  } catch (e) {
    logger.warn(`Could not verify remote refs for ${targetOwner}/${repoName}: ${e.message}`);
    return { verified: false, refs: heads.length, mismatches: ['verification-failed'] };
  }
  return { verified: mismatches.length === 0, refs: heads.length, mismatches };
}

async function restoreRepo(provider, drive, repoFiles, owner, options = {}, manifestHashes = null, ctx = null) {
  const bundleFile = repoFiles.find(f => f.name.endsWith('.bundle') || f.name.endsWith('.bundle.enc'));
  const stateFile = repoFiles.find(f => f.name === 'backup-state.json');
  const isIncremental = !!bundleFile || !!stateFile;
  const gitFile = repoFiles.find(f => (f.name.endsWith('.zip') || f.name.endsWith('.zip.enc')) && !f.name.includes('wiki'));
  const metaFile = repoFiles.find(f => f.name === 'metadata.json');

  if (!metaFile) throw new Error('metadata.json not found in backup');

  const metaTmp = path.join(TMP, `meta-${Date.now()}.json`);
  await drive.downloadFile(metaFile.id, metaTmp);
  const meta = JSON.parse(fs.readFileSync(metaTmp));
  fs.rmSync(metaTmp);

  const repoName = options.repoName || meta.repo.split('/')[1];
  const targetOwner = options.targetOwner || owner;

  // Create the destination repo if it doesn't exist (provider-agnostic)
  await provider.ensureRepo(targetOwner, repoName, options);

  let verification = null;

  // Delta (bundle) restore: reconstruct the full mirror from the bundle chain.
  if (isIncremental) {
    const mirrorDir = await reconstructFromChain(drive, ctx, repoName, repoFiles);
    verification = await deliverGit(provider, mirrorDir, targetOwner, repoName);
    fs.rmSync(mirrorDir, { recursive: true, force: true });
  }

  // Full-archive restore
  if (gitFile && !isIncremental) {
    const isEncrypted = gitFile.name.endsWith('.enc');
    const downloadDest = path.join(TMP, `${repoName}-restore${isEncrypted ? '.zip.enc' : '.zip'}`);
    const zipTmp = isEncrypted ? path.join(TMP, `${repoName}-restore.zip`) : downloadDest;
    const extractDir = path.join(TMP, `${repoName}-extract`);
    fs.mkdirSync(extractDir, { recursive: true });

    // Download with manifest hash verification
    await downloadAndVerify(drive, gitFile, downloadDest, manifestHashes);

    // Decrypt if file ends in .enc
    if (isEncrypted) {
      logger.info(`Decrypting ${gitFile.name}...`);
      await decryptFile(downloadDest, zipTmp);
      fs.rmSync(downloadDest, { force: true });
    }

    await extractZip(zipTmp, { dir: extractDir });

    const gitDir = fs.readdirSync(extractDir).find(d =>
      fs.statSync(path.join(extractDir, d)).isDirectory()
    );
    const repoPath = gitDir ? path.join(extractDir, gitDir) : extractDir;

    verification = await deliverGit(provider, repoPath, targetOwner, repoName);

    fs.rmSync(zipTmp, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  // Restore labels & milestones via the destination provider (best-effort)
  if (meta.labels?.length) {
    await provider.restoreLabels(targetOwner, repoName, meta.labels);
  }
  if (meta.milestones?.length) {
    await provider.restoreMilestones(targetOwner, repoName, meta.milestones);
  }

  // Opt-in best-effort issue re-creation (provider must support it).
  if (options.recreateIssues && meta.issues?.length && typeof provider.restoreIssues === 'function') {
    const n = await provider.restoreIssues(targetOwner, repoName, meta.issues);
    logger.info(`Re-created ${n} issue(s) on ${targetOwner}/${repoName}`);
  }

  logger.info(`✓ Restored ${meta.repo} → ${provider.id}:${targetOwner}/${repoName}`);
  return {
    original: meta.repo,
    restored: `${targetOwner}/${repoName}`,
    provider: provider.id,
    ...(verification ? { verified: verification.verified, refs: verification.refs, mismatches: verification.mismatches } : {}),
  };
}

async function runRestore(options = {}) {
  fs.mkdirSync(TMP, { recursive: true });

  // Build the destination provider (github | gitlab | gitea | local). Each
  // provider validates its own credentials when constructed.
  const provider = getProvider(options);
  logger.info(`Restore destination provider: ${provider.id}`);

  // A remote target owner is required for push providers, but not for local.
  const owner = options.owner || process.env.GITHUB_USER || process.env.RESTORE_TARGET_OWNER || (provider.id === 'local' ? 'local' : '');
  if (!owner) throw new Error('A target owner is required (GITHUB_USER or RESTORE_TARGET_OWNER).');

  const auth = await GoogleDriveClient.createAuthClient(
    process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
    process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
  );
  const drive = new GoogleDriveClient(auth);
  const rootFolderId = options.folderId || process.env.GDRIVE_FOLDER_ID;

  // List backup sessions. A session may be selected by explicit id, by name
  // (from the workflow's session_name input), or defaults to the latest.
  const sessions = await drive.listBackups(rootFolderId);
  let sessionId = options.sessionId;
  if (!sessionId && options.sessionName) {
    const match = sessions.find(s => s.name === options.sessionName);
    if (!match) throw new Error(`Session "${options.sessionName}" not found in Drive folder.`);
    sessionId = match.id;
  }
  if (!sessionId) sessionId = sessions[0]?.id;
  if (!sessionId) throw new Error('No backup sessions found in Drive folder.');

  const sessionName = sessions.find(s => s.id === sessionId)?.name;
  logger.info(`Restoring from session: ${sessionName}`);

  // Map session name → id so delta restores can walk the bundle chain.
  const ctx = { rootFolderId, sessionsByName: Object.fromEntries(sessions.map(s => [s.name, s.id])) };

  const repoFolders = await drive.listFolderContents(sessionId);
  const repoList = repoFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

  const reposToRestore = options.repos?.length
    ? repoList.filter(r => options.repos.includes(r.name))
    : repoList;

  // Feature 1: Dry run — list what would be restored without downloading or extracting
  if (process.env.DRY_RUN === 'true') {
    logger.info('DRY RUN — no files written.');
    logger.info(`Session: ${sessionName} (id: ${sessionId})`);
    logger.info(`Repos that would be restored (${reposToRestore.length}):`);

    let totalSize = 0;
    for (const repoFolder of reposToRestore) {
      const files = await drive.listFolderContents(repoFolder.id);
      const archiveFiles = files.filter(f => f.name.endsWith('.zip') || f.name.endsWith('.zip.enc'));
      const folderSize = archiveFiles.reduce((sum, f) => sum + (f.size ? parseInt(f.size, 10) : 0), 0);
      totalSize += folderSize;
      const fileList = archiveFiles
        .map(f => `${f.name} (${f.size ? Math.round(parseInt(f.size, 10) / 1024) + ' KB' : 'unknown size'})`)
        .join(', ') || '(no archives found)';
      logger.info(`  ${repoFolder.name}: ${archiveFiles.length} archive(s) — ${fileList}`);
    }

    logger.info(`Total estimated download: ${Math.round(totalSize / 1024)} KB across ${reposToRestore.length} repo(s).`);
    logger.info('DRY RUN — no files written.');
    return [];
  }

  const results = [];
  for (const repoFolder of reposToRestore) {
    try {
      const files = await drive.listFolderContents(repoFolder.id);

      // Feature 2: Load manifest for hash verification
      const manifestHashes = await loadManifest(drive, files);

      const result = await restoreRepo(provider, drive, files, owner, options, manifestHashes, ctx);
      results.push({ ...result, status: 'success' });
    } catch (err) {
      logger.error(`Failed restoring ${repoFolder.name}: ${err.message}`);
      results.push({ repo: repoFolder.name, status: 'failed', error: err.message });
    }
  }

  logger.info(`Restore complete: ${results.filter(r => r.status === 'success').length}/${results.length} succeeded`);
  return results;
}

if (require.main === module) {
  runRestore().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { runRestore };
