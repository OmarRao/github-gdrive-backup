// Copyright (c) Omar Rao. All rights reserved.
/* ── Navigation ─────────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'backup')    loadRepos();
    if (page === 'restore')   loadSessions();
    if (page === 'history')   loadHistory();
    if (page === 'settings')  loadSettingsStatus();
  });
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const api = async (method, path, body) => {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
};

function relTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function badge(status) {
  const cls = { running: 'badge-running', done: 'badge-done', failed: 'badge-failed' }[status] || 'badge-running';
  return `<span class="job-badge ${cls}">${status}</span>`;
}

function renderJobList(jobs, container) {
  if (!jobs.length) { container.innerHTML = '<p class="muted" style="padding:12px">No jobs yet.</p>'; return; }
  container.innerHTML = jobs.map(j => `
    <div class="job-item">
      ${badge(j.status)}
      <span class="job-type">${j.type}</span>
      <span class="job-detail">${j.summary ? `${j.summary.success}/${j.summary.total} repos` : j.error || ''}</span>
      <span class="job-time">${relTime(j.startedAt)}</span>
    </div>`).join('');
}

/* ── Connection status ───────────────────────────────────────────────────── */
async function checkStatus() {
  try {
    const s = await api('GET', '/status');
    const pill = document.getElementById('connection-status');
    if (s.githubOk && s.driveOk) {
      pill.className = 'status-pill status-ok';
      pill.innerHTML = `<span class="dot"></span> ${s.githubUser}`;
    } else {
      pill.className = 'status-pill status-warn';
      pill.innerHTML = `<span class="dot"></span> Partial`;
    }
    return s;
  } catch {
    const pill = document.getElementById('connection-status');
    pill.className = 'status-pill status-err';
    pill.innerHTML = `<span class="dot"></span> Error`;
  }
}
checkStatus();

/* ── Dashboard ───────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const [jobs, backups] = await Promise.allSettled([
    api('GET', '/jobs'),
    api('GET', '/backups'),
  ]);
  const jobData = jobs.status === 'fulfilled' ? jobs.value : [];
  const backupData = backups.status === 'fulfilled' ? backups.value : [];

  document.getElementById('stat-backups').textContent = backupData.length;
  document.getElementById('stat-jobs').textContent = jobData.filter(j => j.status === 'running').length;
  document.getElementById('stat-last').textContent = backupData[0] ? relTime(backupData[0].createdTime) : '—';

  try {
    const repos = await api('GET', '/repos');
    document.getElementById('stat-repos').textContent = repos.length;
  } catch { document.getElementById('stat-repos').textContent = '?'; }

  renderJobList(jobData.slice(0, 10), document.getElementById('dashboard-jobs'));
}

document.getElementById('btn-refresh-dashboard').addEventListener('click', loadDashboard);
loadDashboard();

/* ── Backup page ─────────────────────────────────────────────────────────── */
let allRepos = [];

async function loadRepos() {
  const el = document.getElementById('repo-list');
  el.innerHTML = '<p class="muted" style="padding:12px">Loading…</p>';
  try {
    allRepos = await api('GET', '/repos');
    renderRepos(allRepos);
  } catch (err) {
    el.innerHTML = `<p class="muted" style="padding:12px">Error: ${err.message}</p>`;
  }
}

function renderRepos(repos) {
  const el = document.getElementById('repo-list');
  el.innerHTML = repos.map(r => `
    <label class="repo-item">
      <input type="checkbox" class="repo-checkbox" value="${r.full_name}" />
      <span class="repo-name">${r.name}</span>
      <span class="repo-badge ${r.private ? 'private' : ''}">${r.private ? '🔒 private' : 'public'}</span>
    </label>`).join('') || '<p class="muted" style="padding:12px">No repositories found.</p>';
}

document.getElementById('repo-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderRepos(allRepos.filter(r => r.name.toLowerCase().includes(q)));
});

document.getElementById('select-all-repos').addEventListener('change', e => {
  document.querySelectorAll('.repo-checkbox').forEach(cb => cb.checked = e.target.checked);
});

document.getElementById('btn-start-backup').addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('.repo-checkbox:checked')].map(c => c.value);
  const folderId = document.getElementById('backup-folder-id').value.trim() || undefined;
  const include = [...document.querySelectorAll('[name=include]:checked')].map(c => c.value);

  const btn = document.getElementById('btn-start-backup');
  const progress = document.getElementById('backup-progress');
  btn.disabled = true;
  progress.classList.remove('hidden');
  progress.innerHTML = '<p>Starting backup…</p>';

  try {
    const { jobId } = await api('POST', '/backup', { repos: checked, folderId, include });
    progress.innerHTML = `<p>Job started: <code>${jobId}</code></p><p>Polling status…</p>`;
    pollJob(jobId, progress, btn);
  } catch (err) {
    progress.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
    btn.disabled = false;
  }
});

/* ── Restore page ────────────────────────────────────────────────────────── */
async function loadSessions() {
  const el = document.getElementById('session-list');
  const sel = document.getElementById('restore-session');
  el.innerHTML = '<p class="muted" style="padding:12px">Loading…</p>';
  try {
    const sessions = await api('GET', '/backups');
    el.innerHTML = sessions.map(s => `
      <div class="session-item" data-id="${s.id}">
        <span class="session-name">${s.name}</span>
        <span class="session-date">${relTime(s.createdTime)}</span>
      </div>`).join('') || '<p class="muted" style="padding:12px">No backup sessions found.</p>';
    sel.innerHTML = '<option value="">— select a session —</option>' +
      sessions.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    el.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        el.querySelectorAll('.session-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        sel.value = item.dataset.id;
        sel.dispatchEvent(new Event('change'));
      });
    });
  } catch (err) {
    el.innerHTML = `<p class="muted" style="padding:12px">Error: ${err.message}</p>`;
  }
}

document.getElementById('restore-session').addEventListener('change', async function () {
  const sid = this.value;
  const container = document.getElementById('restore-repo-selector');
  const listEl = document.getElementById('restore-repo-list');
  if (!sid) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  listEl.innerHTML = '<p class="muted" style="padding:12px">Loading…</p>';
  try {
    const repos = await api('GET', `/backups/${sid}/repos`);
    listEl.innerHTML = repos.map(r => `
      <label class="repo-item">
        <input type="checkbox" class="restore-repo-checkbox" value="${r.name}" checked />
        <span class="repo-name">${r.name}</span>
      </label>`).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="muted" style="padding:12px">Error: ${err.message}</p>`;
  }
});

document.getElementById('btn-start-restore').addEventListener('click', async () => {
  const sessionId = document.getElementById('restore-session').value;
  if (!sessionId) return alert('Please select a backup session.');

  const repos = [...document.querySelectorAll('.restore-repo-checkbox:checked')].map(c => c.value);
  const targetOwner = document.getElementById('restore-target-owner').value.trim() || undefined;
  const isPrivate = document.getElementById('restore-private').checked;

  const btn = document.getElementById('btn-start-restore');
  const progress = document.getElementById('restore-progress');
  btn.disabled = true;
  progress.classList.remove('hidden');
  progress.innerHTML = '<p>Starting restore…</p>';

  try {
    const { jobId } = await api('POST', '/restore', { sessionId, repos, targetOwner, private: isPrivate });
    progress.innerHTML = `<p>Job started: <code>${jobId}</code></p><p>Polling status…</p>`;
    pollJob(jobId, progress, btn);
  } catch (err) {
    progress.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
    btn.disabled = false;
  }
});

/* ── History ─────────────────────────────────────────────────────────────── */
async function loadHistory() {
  try {
    const jobs = await api('GET', '/jobs');
    renderJobList(jobs, document.getElementById('history-list'));
  } catch (err) {
    document.getElementById('history-list').innerHTML = `<p class="muted" style="padding:12px">Error: ${err.message}</p>`;
  }
}
document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);

/* ── Settings ────────────────────────────────────────────────────────────── */
async function loadSettingsStatus() {
  const container = document.getElementById('settings-status');
  try {
    const s = await api('GET', '/status');
    container.innerHTML = `
      <div class="settings-row">
        <span class="label">GitHub</span>
        ${s.githubOk
          ? `<span style="color:#3fb950">✓ Connected as <strong>${s.githubUser}</strong></span>`
          : `<span style="color:var(--danger)">✗ Not connected</span>`}
      </div>
      <div class="settings-row">
        <span class="label">Google Drive</span>
        ${s.driveOk
          ? `<span style="color:#3fb950">✓ Token found</span>`
          : `<span style="color:var(--danger)">✗ Token missing — run auth script</span>`}
      </div>`;
  } catch {
    container.innerHTML = '<p class="muted">Could not load status.</p>';
  }
}

document.getElementById('btn-test-github').addEventListener('click', async () => {
  const token = document.getElementById('settings-gh-token').value.trim();
  const params = token ? `?token=${encodeURIComponent(token)}` : '';
  try {
    const s = await api('GET', `/status${params}`);
    alert(s.githubOk ? `Connected as ${s.githubUser}` : 'GitHub not connected — check token');
  } catch (err) { alert(`Error: ${err.message}`); }
});

document.getElementById('btn-test-drive').addEventListener('click', async () => {
  try {
    const s = await api('GET', '/status');
    alert(s.driveOk ? 'Google Drive token found ✓' : 'Drive token missing — run node src/auth/google-auth.js');
  } catch (err) { alert(`Error: ${err.message}`); }
});

/* ── Job polling ─────────────────────────────────────────────────────────── */
function pollJob(jobId, progressEl, btn) {
  const interval = setInterval(async () => {
    try {
      const job = await api('GET', `/jobs/${jobId}`);
      if (job.status === 'running') {
        progressEl.innerHTML = `<p>Running… <code>${jobId}</code></p>`;
        return;
      }
      clearInterval(interval);
      btn.disabled = false;
      if (job.status === 'done') {
        const s = job.summary || {};
        const detail = s.total
          ? `${s.success}/${s.total} repositories backed up successfully.`
          : `${(job.results || []).filter(r => r.status === 'success').length} repositories restored.`;
        progressEl.innerHTML = `<p style="color:#3fb950">✓ Complete — ${detail}</p>`;
      } else {
        progressEl.innerHTML = `<p style="color:var(--danger)">✗ Failed: ${job.error}</p>`;
      }
    } catch {
      clearInterval(interval);
      btn.disabled = false;
    }
  }, 3000);
}
