// Copyright (c) Omar Rao. All rights reserved.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const extractZip = require('extract-zip');
const simpleGit = require('simple-git');
const GoogleDriveClient = require('../backup/gdrive');
const { getProvider } = require('./providers');
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

async function restoreRepo(provider, drive, repoFiles, owner, options = {}, manifestHashes = null) {
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

  // Push git content
  if (gitFile) {
    const isEncrypted = gitFile.name.endsWith('.enc');
    const downloadDest = path.join(TMP, `${repoName}-restore${isEncrypted ? '.zip.enc' : '.zip'}`);
    const zipTmp = isEncrypted ? path.join(TMP, `${repoName}-restore.zip`) : downloadDest;
    const extractDir = path.join(TMP, `${repoName}-extract`);
    fs.mkdirSync(extractDir, { recursive: true });

    // Feature 2: Download with manifest hash verification
    await downloadAndVerify(drive, gitFile, downloadDest, manifestHashes);

    // Feature 9: Decrypt if file ends in .enc
    if (isEncrypted) {
      logger.info(`Decrypting ${gitFile.name}...`);
      await decryptFile(downloadDest, zipTmp);
      fs.rmSync(downloadDest, { force: true });
    }

    await extractZip(zipTmp, { dir: extractDir });

    const remoteUrl = provider.remoteUrl(targetOwner, repoName);

    const gitDir = fs.readdirSync(extractDir).find(d =>
      fs.statSync(path.join(extractDir, d)).isDirectory()
    );
    const repoPath = gitDir ? path.join(extractDir, gitDir) : extractDir;

    await simpleGit(repoPath).addRemote('target', remoteUrl).catch(() => {});
    await simpleGit(repoPath).push('target', '--all', ['--force']);
    await simpleGit(repoPath).push('target', '--tags', ['--force']);

    fs.rmSync(zipTmp, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
    logger.info(`Pushed git content to ${targetOwner}/${repoName}`);
  }

  // Restore labels & milestones via the destination provider (best-effort)
  if (meta.labels?.length) {
    await provider.restoreLabels(targetOwner, repoName, meta.labels);
  }
  if (meta.milestones?.length) {
    await provider.restoreMilestones(targetOwner, repoName, meta.milestones);
  }

  logger.info(`✓ Restored ${meta.repo} → ${provider.id}:${targetOwner}/${repoName}`);
  return { original: meta.repo, restored: `${targetOwner}/${repoName}`, provider: provider.id };
}

async function runRestore(options = {}) {
  const owner = options.owner || process.env.GITHUB_USER || process.env.RESTORE_TARGET_OWNER;

  if (!owner) throw new Error('A target owner is required (GITHUB_USER or RESTORE_TARGET_OWNER).');

  fs.mkdirSync(TMP, { recursive: true });

  // Build the destination provider (github | gitlab | gitea). Each provider
  // validates its own credentials when constructed.
  const provider = getProvider(options);
  logger.info(`Restore destination provider: ${provider.id}`);

  const auth = await GoogleDriveClient.createAuthClient(
    process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
    process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
  );
  const drive = new GoogleDriveClient(auth);
  const rootFolderId = options.folderId || process.env.GDRIVE_FOLDER_ID;

  // List backup sessions
  const sessions = await drive.listBackups(rootFolderId);
  const sessionId = options.sessionId || sessions[0]?.id;
  if (!sessionId) throw new Error('No backup sessions found in Drive folder.');

  const sessionName = sessions.find(s => s.id === sessionId)?.name;
  logger.info(`Restoring from session: ${sessionName}`);

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

      const result = await restoreRepo(provider, drive, files, owner, options, manifestHashes);
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
