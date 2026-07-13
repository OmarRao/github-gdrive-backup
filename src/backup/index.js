// Copyright (c) Omar Rao. All rights reserved.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const archiver = require('archiver');
const GitHubClient = require('./github');
const GoogleDriveClient = require('./gdrive');
const fanout = require('./storage/fanout');
const logger = require('../logger');

const INCLUDE = (process.env.BACKUP_INCLUDE || 'code,issues,pull_requests,releases,wiki,labels,milestones').split(',');
const TMP = path.resolve(process.env.BACKUP_TMP_DIR || './tmp');
const CONCURRENCY = parseInt(process.env.BACKUP_CONCURRENCY || '3', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) {
      fs.writeFileSync('/tmp/pat-expired', '1');
      throw new Error('PAT_EXPIRED: GitHub token returned 401');
    }
    if (err.status === 403 || err.status === 429) {
      const resetHeader = err.response && err.response.headers && err.response.headers['x-ratelimit-reset'];
      const waitMs = resetHeader ? Math.max(0, (parseInt(resetHeader, 10) * 1000) - Date.now()) : 60000;
      console.warn('GitHub rate limit hit, waiting...');
      await sleep(waitMs);
      return await fn();
    }
    throw err;
  }
}

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

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function encryptFile(inputPath, outputPath, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  // Prepend IV as first 16 bytes
  const output = Buffer.concat([iv, encrypted]);
  fs.writeFileSync(outputPath, output);
}

async function backupRepo(gh, drive, repo, backupFolderId, mirrorFolders) {
  const { owner, name } = repo;
  const repoDir = path.join(TMP, `${owner.login}-${name}-${Date.now()}`);
  fs.mkdirSync(repoDir, { recursive: true });

  const repoFolder = await drive.ensureFolder(name, backupFolderId);

  let manifestEntry = null;
  const mirrorResults = [];

  try {
    if (INCLUDE.includes('code')) {
      await gh.cloneRepo(repo, repoDir);
      const zipPath = `${repoDir}.zip`;
      await zipDirectory(repoDir, zipPath);

      // Compute SHA-256 of the zip
      const sha256 = computeSha256(zipPath);
      const localSize = fs.statSync(zipPath).size;

      const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
      let uploadPath = zipPath;
      let uploadFileName = `${name}.zip`;
      let encrypted = false;

      if (encryptionKey) {
        const encPath = `${zipPath}.enc`;
        encryptFile(zipPath, encPath, encryptionKey);
        fs.rmSync(zipPath, { force: true });
        uploadPath = encPath;
        uploadFileName = `${name}.zip.enc`;
        encrypted = true;
      }

      const uploaded = await drive.uploadFile(uploadPath, repoFolder);

      // Fan-out: mirror the exact bytes we uploaded to Drive to secondary
      // destinations before we delete the local copy (3-2-1 rule).
      if (mirrorFolders) {
        const mirrorSize = fs.statSync(uploadPath).size;
        const res = await fanout.mirrorFile(uploadPath, mirrorFolders, uploadFileName, mirrorSize);
        mirrorResults.push({ file: uploadFileName, targets: res });
      }

      fs.rmSync(uploadPath, { force: true });

      if (!encrypted) {
        const driveSize = parseInt(uploaded.size, 10);
        if (!driveSize || driveSize !== localSize) {
          logger.error(`Verification failed for ${name}: local size ${localSize} bytes, Drive size ${driveSize || 0} bytes`);
          throw new Error(`Upload verification failed: size mismatch for ${name}.zip`);
        }
        logger.info(`Verified ${name}.zip: ${localSize} bytes matches Drive`);
      } else {
        logger.info(`Uploaded encrypted ${name}.zip.enc (original zip size: ${localSize} bytes)`);
      }

      manifestEntry = {
        repo: repo.full_name,
        file: uploadFileName,
        size: localSize,
        sha256,
        encrypted,
      };
    }

    const metadata = { repo: repo.full_name, backed_up_at: new Date().toISOString() };

    if (INCLUDE.includes('issues')) {
      metadata.issues = await withRateLimitRetry(() => gh.fetchIssues(owner.login, name));
    }
    if (INCLUDE.includes('pull_requests')) {
      metadata.pull_requests = await withRateLimitRetry(() => gh.fetchPullRequests(owner.login, name));
    }
    if (INCLUDE.includes('releases')) {
      metadata.releases = await withRateLimitRetry(() => gh.fetchReleases(owner.login, name));
    }
    if (INCLUDE.includes('labels')) {
      metadata.labels = await withRateLimitRetry(() => gh.fetchLabels(owner.login, name));
    }
    if (INCLUDE.includes('milestones')) {
      metadata.milestones = await withRateLimitRetry(() => gh.fetchMilestones(owner.login, name));
    }
    if (INCLUDE.includes('wiki')) {
      const wikiDir = await gh.fetchWiki(owner.login, name, repoDir);
      if (wikiDir) {
        const wikiZip = `${repoDir}-wiki.zip`;
        await zipDirectory(wikiDir, wikiZip);
        const wikiLocalSize = fs.statSync(wikiZip).size;
        const wikiUploaded = await drive.uploadFile(wikiZip, repoFolder);
        if (mirrorFolders) {
          const res = await fanout.mirrorFile(wikiZip, mirrorFolders, `${name}-wiki.zip`, wikiLocalSize);
          mirrorResults.push({ file: `${name}-wiki.zip`, targets: res });
        }
        fs.rmSync(wikiZip, { force: true });
        const wikiDriveSize = parseInt(wikiUploaded.size, 10);
        if (!wikiDriveSize || wikiDriveSize !== wikiLocalSize) {
          logger.error(`Verification failed for ${name} wiki: local size ${wikiLocalSize} bytes, Drive size ${wikiDriveSize || 0} bytes`);
          throw new Error(`Upload verification failed: size mismatch for ${name}-wiki.zip`);
        }
        logger.info(`Verified ${name}-wiki.zip: ${wikiLocalSize} bytes matches Drive`);
        metadata.wiki_backed_up = true;
      }
    }

    await drive.uploadJson('metadata.json', metadata, repoFolder);
    if (mirrorFolders) {
      const res = await fanout.mirrorJson(TMP, `${name}-metadata.json`, metadata, mirrorFolders);
      mirrorResults.push({ file: `${name}-metadata.json`, targets: res });
    }
    logger.info(`✓ ${repo.full_name} backed up`);
    return {
      repo: repo.full_name,
      status: 'success',
      driveFolder: repoFolder,
      ...(manifestEntry || {}),
      ...(mirrorResults.length ? { mirrors: mirrorResults } : {}),
    };
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

async function backupGitLabProject(drive, project, sessionFolder, gitlabToken, gitlabHost, mirrorFolders) {
  const projectPath = project.path_with_namespace;
  const repoName = project.path;
  const safeDir = path.join(TMP, `gitlab-${repoName}-${Date.now()}`);
  fs.mkdirSync(safeDir, { recursive: true });

  const repoFolder = await drive.ensureFolder(`gitlab-${repoName}`, sessionFolder);

  let manifestEntry = null;

  try {
    const cloneUrl = `https://oauth2:${gitlabToken}@${gitlabHost.replace(/^https?:\/\//, '')}/${projectPath}.git`;
    execSync(`git clone --mirror "${cloneUrl}" "${safeDir}"`, { stdio: 'pipe' });

    const zipPath = `${safeDir}.zip`;
    await zipDirectory(safeDir, zipPath);

    const sha256 = computeSha256(zipPath);
    const localSize = fs.statSync(zipPath).size;

    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
    let uploadPath = zipPath;
    let uploadFileName = `gitlab-${repoName}.zip`;
    let encrypted = false;

    if (encryptionKey) {
      const encPath = `${zipPath}.enc`;
      encryptFile(zipPath, encPath, encryptionKey);
      fs.rmSync(zipPath, { force: true });
      uploadPath = encPath;
      uploadFileName = `gitlab-${repoName}.zip.enc`;
      encrypted = true;
    }

    await drive.uploadFile(uploadPath, repoFolder);
    let mirrors = null;
    if (mirrorFolders) {
      const mirrorSize = fs.statSync(uploadPath).size;
      mirrors = [{ file: uploadFileName, targets: await fanout.mirrorFile(uploadPath, mirrorFolders, uploadFileName, mirrorSize) }];
    }
    fs.rmSync(uploadPath, { force: true });

    logger.info(`✓ GitLab ${projectPath} backed up`);

    manifestEntry = {
      repo: `gitlab:${projectPath}`,
      file: uploadFileName,
      size: localSize,
      sha256,
      encrypted,
    };

    return { repo: `gitlab:${projectPath}`, status: 'success', driveFolder: repoFolder, ...manifestEntry, ...(mirrors ? { mirrors } : {}) };
  } finally {
    fs.rmSync(safeDir, { recursive: true, force: true });
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
  const sessionName = `backup-${timestamp}`;
  const sessionFolder = await drive.ensureFolder(sessionName, rootFolderId);

  logger.info(`Backup session folder: ${sessionFolder}`);

  // Multi-destination fan-out (3-2-1). Drive is primary; these are mirrors.
  let mirrorFolders = null;
  if (fanout.enabled()) {
    mirrorFolders = await fanout.initSessionFolders(sessionName);
    logger.info(`Fan-out enabled — mirroring to: ${fanout.parseTargets().join(', ')}`);
  }

  let repos = options.repos
    ? options.repos.map(r => ({ owner: { login: r.split('/')[0] }, name: r.split('/')[1] }))
    : await gh.listRepos(owner);

  // Multi-org support
  const orgsEnv = options.orgs || process.env.GITHUB_ORGS || '';
  if (orgsEnv) {
    const orgs = orgsEnv.split(',').map(o => o.trim()).filter(Boolean);
    for (const org of orgs) {
      let page = 1;
      while (true) {
        const orgRepos = await withRateLimitRetry(() =>
          gh.octokit.repos.listForOrg({ org, per_page: 100, type: 'all', page }).then(r => r.data)
        );
        repos = repos.concat(orgRepos);
        if (orgRepos.length < 100) break;
        page++;
      }
    }
  }

  logger.info(`Found ${repos.length} repositories`);

  const results = [];
  for (let i = 0; i < repos.length; i += CONCURRENCY) {
    const batch = repos.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(r => backupRepo(gh, drive, r, sessionFolder, mirrorFolders))
    );
    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.push(r.value);
      else {
        logger.error(`Failed ${batch[idx].full_name}: ${r.reason.message}`);
        results.push({ repo: batch[idx].full_name, status: 'failed', error: r.reason.message });
      }
    });
    if (i + CONCURRENCY < repos.length) await sleep(200);
  }

  // GitLab backup
  const gitlabToken = process.env.GITLAB_TOKEN;
  if (gitlabToken) {
    const gitlabHost = process.env.GITLAB_HOST || 'https://gitlab.com';
    const gitlabApiBase = `${gitlabHost}/api/v4`;
    logger.info(`Starting GitLab backup from ${gitlabHost}`);

    let glPage = 1;
    let gitlabProjects = [];
    while (true) {
      let pageProjects = [];
      try {
        const { https, http } = await (async () => {
          const mod = gitlabHost.startsWith('https') ? require('https') : require('http');
          return { https: mod, http: mod };
        })();
        // Use built-in https/http to fetch GitLab projects
        const pageData = await new Promise((resolve, reject) => {
          const url = new URL(`${gitlabApiBase}/projects?membership=true&per_page=100&page=${glPage}`);
          const reqModule = url.protocol === 'https:' ? require('https') : require('http');
          const req = reqModule.get(url.toString(), { headers: { 'PRIVATE-TOKEN': gitlabToken } }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
        });
        pageProjects = Array.isArray(pageData) ? pageData : [];
      } catch (glErr) {
        logger.error(`GitLab API page ${glPage} fetch failed: ${glErr.message}`);
        break;
      }
      gitlabProjects = gitlabProjects.concat(pageProjects);
      if (pageProjects.length < 100) break;
      glPage++;
    }

    logger.info(`Found ${gitlabProjects.length} GitLab projects`);

    for (const project of gitlabProjects) {
      try {
        const glResult = await backupGitLabProject(drive, project, sessionFolder, gitlabToken, gitlabHost, mirrorFolders);
        results.push(glResult);
      } catch (glErr) {
        logger.error(`GitLab project ${project.path_with_namespace} failed: ${glErr.message}`);
        results.push({ repo: `gitlab:${project.path_with_namespace}`, status: 'failed', error: glErr.message });
      }
    }
  }

  // Build SHA-256 manifest
  const manifestRepos = results
    .filter(r => r.status === 'success' && r.file && r.sha256)
    .map(r => ({
      repo: r.repo,
      file: r.file,
      size: r.size,
      sha256: r.sha256,
      ...(r.encrypted !== undefined ? { encrypted: r.encrypted } : {}),
    }));

  const manifest = {
    session: sessionName,
    generated: new Date().toISOString(),
    repos: manifestRepos,
  };

  const manifestPath = path.join(TMP, `manifest-${timestamp}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  await drive.uploadFile(manifestPath, sessionFolder);
  if (mirrorFolders) {
    await fanout.mirrorFile(manifestPath, mirrorFolders, 'manifest.json');
  }
  fs.rmSync(manifestPath, { force: true });
  logger.info(`Manifest written with ${manifestRepos.length} entries`);

  // Aggregate fan-out results across all repos into a session-level summary.
  let mirror = null;
  if (mirrorFolders) {
    const targets = fanout.parseTargets();
    const perTarget = Object.fromEntries(targets.map(t => [t, { ok: 0, failed: 0 }]));
    results.forEach(r => (r.mirrors || []).forEach(m => (m.targets || []).forEach(x => {
      if (!perTarget[x.target]) perTarget[x.target] = { ok: 0, failed: 0 };
      perTarget[x.target][x.ok ? 'ok' : 'failed']++;
    })));
    mirror = { targets, perTarget };
  }

  const summary = {
    timestamp,
    total: repos.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    ...(mirror ? { mirror } : {}),
    results,
  };

  await drive.uploadJson('backup-summary.json', summary, sessionFolder);
  if (mirrorFolders) {
    await fanout.mirrorJson(TMP, 'backup-summary.json', summary, mirrorFolders);
  }
  logger.info(`Backup complete: ${summary.success}/${summary.total} succeeded`);
  return summary;
}

if (require.main === module) {
  runBackup().catch(err => { logger.error(err); process.exit(1); });
}

module.exports = { runBackup };
