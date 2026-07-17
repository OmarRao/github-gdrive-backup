// Copyright (c) Omar Rao. All rights reserved.
const express = require('express');
const router = express.Router();
const { runBackup } = require('../../backup/index');
const { runRestore } = require('../../restore/index');
const GoogleDriveClient = require('../../backup/gdrive');
const GitHubClient = require('../../backup/github');

// Active job state (in-memory; use a DB for production multi-node setups)
const jobs = new Map();

function makeJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Status ────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const token = req.query.token || process.env.GITHUB_TOKEN;
  const driveOk = require('fs').existsSync(
    process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
  );
  let githubOk = false;
  let githubUser = null;
  try {
    const gh = new GitHubClient(token);
    const { data } = await gh.octokit.users.getAuthenticated();
    githubOk = true;
    githubUser = data.login;
  } catch {}
  res.json({ githubOk, githubUser, driveOk });
});

// ─── List repos ────────────────────────────────────────────────────────────────
router.get('/repos', async (req, res) => {
  try {
    const token = req.query.token || process.env.GITHUB_TOKEN;
    const owner = req.query.owner || process.env.GITHUB_USER;
    const gh = new GitHubClient(token);
    const repos = await gh.listRepos(owner);
    res.json(repos.map(r => ({ name: r.name, full_name: r.full_name, private: r.private, size: r.size, updated_at: r.updated_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── List Drive backup sessions ────────────────────────────────────────────────
router.get('/backups', async (req, res) => {
  try {
    const auth = await GoogleDriveClient.createAuthClient(
      process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
      process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
    );
    const drive = new GoogleDriveClient(auth);
    const sessions = await drive.listBackups(process.env.GDRIVE_FOLDER_ID);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── List repos inside a session ──────────────────────────────────────────────
router.get('/backups/:sessionId/repos', async (req, res) => {
  try {
    const auth = await GoogleDriveClient.createAuthClient(
      process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
      process.env.GOOGLE_TOKEN_PATH || './credentials/google-token.json'
    );
    const drive = new GoogleDriveClient(auth);
    const files = await drive.listFolderContents(req.params.sessionId);
    res.json(files.filter(f => f.mimeType === 'application/vnd.google-apps.folder'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start backup ──────────────────────────────────────────────────────────────
router.post('/backup', async (req, res) => {
  const jobId = makeJobId();
  const opts = {
    token: req.body.token || process.env.GITHUB_TOKEN,
    owner: req.body.owner || process.env.GITHUB_USER,
    folderId: req.body.folderId || process.env.GDRIVE_FOLDER_ID,
    repos: req.body.repos || [],
  };

  jobs.set(jobId, { id: jobId, type: 'backup', status: 'running', startedAt: new Date(), log: [] });

  runBackup(opts)
    .then(summary => jobs.set(jobId, { ...jobs.get(jobId), status: 'done', summary, finishedAt: new Date() }))
    .catch(err => jobs.set(jobId, { ...jobs.get(jobId), status: 'failed', error: err.message, finishedAt: new Date() }));

  res.json({ jobId, message: 'Backup started' });
});

// ─── Start restore ─────────────────────────────────────────────────────────────
router.post('/restore', async (req, res) => {
  const jobId = makeJobId();
  const opts = {
    token: req.body.token || process.env.GITHUB_TOKEN,
    owner: req.body.owner || process.env.GITHUB_USER,
    folderId: req.body.folderId || process.env.GDRIVE_FOLDER_ID,
    sessionId: req.body.sessionId,
    repos: req.body.repos || [],
    private: req.body.private !== false,
    targetOwner: req.body.targetOwner,
  };

  if (!opts.sessionId) return res.status(400).json({ error: 'sessionId is required' });

  jobs.set(jobId, { id: jobId, type: 'restore', status: 'running', startedAt: new Date() });

  runRestore(opts)
    .then(results => jobs.set(jobId, { ...jobs.get(jobId), status: 'done', results, finishedAt: new Date() }))
    .catch(err => jobs.set(jobId, { ...jobs.get(jobId), status: 'failed', error: err.message, finishedAt: new Date() }));

  res.json({ jobId, message: 'Restore started' });
});

// ─── Job status ────────────────────────────────────────────────────────────────
router.get('/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.get('/jobs', (req, res) => {
  res.json([...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50));
});

module.exports = router;
