require('dotenv').config();
const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');
const GoogleDriveClient = require('../backup/gdrive');
const logger = require('../logger');

const TMP = path.resolve(process.env.BACKUP_TMP_DIR || './tmp');

async function restoreRepo(octokit, drive, repoFiles, owner, options = {}) {
  const gitFile = repoFiles.find(f => f.name.endsWith('.zip') && !f.name.includes('wiki'));
  const metaFile = repoFiles.find(f => f.name === 'metadata.json');

  if (!metaFile) throw new Error('metadata.json not found in backup');

  const metaTmp = path.join(TMP, `meta-${Date.now()}.json`);
  await drive.downloadFile(metaFile.id, metaTmp);
  const meta = JSON.parse(fs.readFileSync(metaTmp));
  fs.rmSync(metaTmp);

  const repoName = options.repoName || meta.repo.split('/')[1];
  const targetOwner = options.targetOwner || owner;

  // Create GitHub repo if it doesn't exist
  try {
    await octokit.repos.get({ owner: targetOwner, repo: repoName });
    logger.info(`Repo ${targetOwner}/${repoName} already exists — pushing to it`);
  } catch {
    await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: options.private !== false,
      description: `Restored from backup on ${new Date().toISOString()}`,
    });
    logger.info(`Created repo ${targetOwner}/${repoName}`);
  }

  // Push git content
  if (gitFile) {
    const zipTmp = path.join(TMP, `${repoName}-restore.zip`);
    const extractDir = path.join(TMP, `${repoName}-extract`);
    fs.mkdirSync(extractDir, { recursive: true });

    await drive.downloadFile(gitFile.id, zipTmp);
    await extractZip(zipTmp, { dir: extractDir });

    const token = process.env.GITHUB_TOKEN;
    const remoteUrl = `https://x-access-token:${token}@github.com/${targetOwner}/${repoName}.git`;

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

  // Restore labels
  if (meta.labels?.length) {
    for (const label of meta.labels) {
      await octokit.issues.createLabel({
        owner: targetOwner, repo: repoName,
        name: label.name, color: label.color, description: label.description || '',
      }).catch(() => {});
    }
  }

  // Restore milestones
  if (meta.milestones?.length) {
    for (const ms of meta.milestones) {
      await octokit.issues.createMilestone({
        owner: targetOwner, repo: repoName,
        title: ms.title, description: ms.description, due_on: ms.due_on,
      }).catch(() => {});
    }
  }

  logger.info(`✓ Restored ${meta.repo} → ${targetOwner}/${repoName}`);
  return { original: meta.repo, restored: `${targetOwner}/${repoName}` };
}

async function runRestore(options = {}) {
  const token = options.token || process.env.GITHUB_TOKEN;
  const owner = options.owner || process.env.GITHUB_USER;

  if (!token || !owner) throw new Error('GITHUB_TOKEN and GITHUB_USER are required.');

  fs.mkdirSync(TMP, { recursive: true });

  const octokit = new Octokit({ auth: token });
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

  logger.info(`Restoring from session: ${sessions.find(s => s.id === sessionId)?.name}`);

  const repoFolders = await drive.listFolderContents(sessionId);
  const repoList = repoFolders.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

  const reposToRestore = options.repos?.length
    ? repoList.filter(r => options.repos.includes(r.name))
    : repoList;

  const results = [];
  for (const repoFolder of reposToRestore) {
    try {
      const files = await drive.listFolderContents(repoFolder.id);
      const result = await restoreRepo(octokit, drive, files, owner, options);
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
