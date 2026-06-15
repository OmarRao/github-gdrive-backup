require('dotenv').config();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const GitHubClient = require('./github');
const GoogleDriveClient = require('./gdrive');
const logger = require('../logger');

const INCLUDE = (process.env.BACKUP_INCLUDE || 'code,issues,pull_requests,releases,wiki,labels,milestones').split(',');
const TMP = path.resolve(process.env.BACKUP_TMP_DIR || './tmp');
const CONCURRENCY = parseInt(process.env.BACKUP_CONCURRENCY || '3', 10);

async function zipDirectory(srcDir, outFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function backupRepo(gh, drive, repo, backupFolderId) {
  const { owner, name } = repo;
  const repoDir = path.join(TMP, `${owner.login}-${name}-${Date.now()}`);
  fs.mkdirSync(repoDir, { recursive: true });

  const repoFolder = await drive.ensureFolder(name, backupFolderId);

  try {
    if (INCLUDE.includes('code')) {
      await gh.cloneRepo(repo, repoDir);
      const zipPath = `${repoDir}.zip`;
      await zipDirectory(repoDir, zipPath);
      await drive.uploadFile(zipPath, repoFolder);
      fs.rmSync(zipPath, { force: true });
    }

    const metadata = { repo: repo.full_name, backed_up_at: new Date().toISOString() };

    if (INCLUDE.includes('issues')) {
      metadata.issues = await gh.fetchIssues(owner.login, name);
    }
    if (INCLUDE.includes('pull_requests')) {
      metadata.pull_requests = await gh.fetchPullRequests(owner.login, name);
    }
    if (INCLUDE.includes('releases')) {
      metadata.releases = await gh.fetchReleases(owner.login, name);
    }
    if (INCLUDE.includes('labels')) {
      metadata.labels = await gh.fetchLabels(owner.login, name);
    }
    if (INCLUDE.includes('milestones')) {
      metadata.milestones = await gh.fetchMilestones(owner.login, name);
    }
    if (INCLUDE.includes('wiki')) {
      const wikiDir = await gh.fetchWiki(owner.login, name, repoDir);
      if (wikiDir) {
        const wikiZip = `${repoDir}-wiki.zip`;
        await zipDirectory(wikiDir, wikiZip);
        await drive.uploadFile(wikiZip, repoFolder);
        fs.rmSync(wikiZip, { force: true });
        metadata.wiki_backed_up = true;
      }
    }

    await drive.uploadJson('metadata.json', metadata, repoFolder);
    logger.info(`✓ ${repo.full_name} backed up`);
    return { repo: repo.full_name, status: 'success', driveFolder: repoFolder };
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

async function runBackup(options = {}) {
  const token = options.token || process.env.GITHUB_TOKEN;
  const owner = options.owner || process.env.GITHUB_USER;
  const rootFolderId = options.folderId || process.env.GDRIVE_FOLDER_ID;

  if (!token || !owner || !rootFolderId) {
    throw new Error('GITHUB_TOKEN, GITHUB_USER and GDRIVE_FOLDER_ID are required.');
  }

  fs.mkdirSync(TMP, { recursive: true });

  const gh = new GitHubClient(token);
  const auth = await GoogleDriveClient.createAuthClient(
    process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
    process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
  );
  const drive = new GoogleDriveClient(auth);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionFolder = await drive.ensureFolder(`backup-${timestamp}`, rootFolderId);

  logger.info(`Backup session folder: ${sessionFolder}`);

  const repos = options.repos
    ? options.repos.map(r => ({ owner: { login: r.split('/')[0] }, name: r.split('/')[1] }))
    : await gh.listRepos(owner);

  logger.info(`Found ${repos.length} repositories`);

  const results = [];
  for (let i = 0; i < repos.length; i += CONCURRENCY) {
    const batch = repos.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(r => backupRepo(gh, drive, r, sessionFolder))
    );
    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.push(r.value);
      else {
        logger.error(`Failed ${batch[idx].full_name}: ${r.reason.message}`);
        results.push({ repo: batch[idx].full_name, status: 'failed', error: r.reason.message });
      }
    });
  }

  const summary = {
    timestamp,
    total: repos.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
  };

  await drive.uploadJson('backup-summary.json', summary, sessionFolder);
  logger.info(`Backup complete: ${summary.success}/${summary.total} succeeded`);
  return summary;
}

if (require.main === module) {
  runBackup().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { runBackup };
