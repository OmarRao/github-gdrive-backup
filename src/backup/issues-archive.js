// Copyright (c) Omar Rao. All rights reserved.
/**
 * Render backed-up issues and pull requests into a single self-contained,
 * browsable HTML page. Git APIs can't reliably re-create issues/PRs across
 * hosts, so this guarantees the captured data is always human-readable at
 * restore time — no tooling required, works offline.
 */

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(item, kind) {
  const state = (item.state || '').toLowerCase();
  const color = state === 'open' ? '#166534' : '#6b7280';
  const bg = state === 'open' ? '#dcfce7' : '#f3f4f6';
  const num = (item.number !== null && item.number !== undefined) ? `#${item.number}` : '';
  const who = item.user && item.user.login ? item.user.login : 'unknown';
  const when = item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : '';
  const labels = (item.labels || [])
    .map(l => `<span class="lbl">${esc(l.name || l)}</span>`).join(' ');
  return `<tr>
    <td class="num">${esc(kind)} ${esc(num)}</td>
    <td><div class="title">${esc(item.title)}</div>${labels ? `<div class="labels">${labels}</div>` : ''}</td>
    <td><span class="state" style="color:${color};background:${bg}">${esc(item.state || '')}</span></td>
    <td class="meta">${esc(who)}<br>${esc(when)}</td>
  </tr>`;
}

/**
 * @param {Object} meta  A repo metadata.json object (issues, pull_requests…).
 * @returns {string} full HTML document
 */
function renderIssuesHtml(meta = {}) {
  const issues = (meta.issues || []).filter(i => !i.pull_request); // exclude PRs surfaced via issues API
  const prs = meta.pull_requests || [];
  const rows = [
    ...issues.map(i => row(i, 'Issue')),
    ...prs.map(p => row(p, 'PR')),
  ].join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Issues &amp; PRs — ${esc(meta.repo || '')}</title>
<style>
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
  header{background:#0f172a;color:#fff;padding:20px 28px}
  header h1{margin:0;font-size:18px}
  header p{margin:4px 0 0;color:#94a3b8;font-size:13px}
  .wrap{max-width:1000px;margin:24px auto;padding:0 20px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
  td{padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
  .num{white-space:nowrap;color:#64748b;font-weight:600}
  .title{font-weight:600}
  .state{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px}
  .lbl{display:inline-block;font-size:10.5px;background:#eff6ff;color:#2563eb;padding:1px 7px;border-radius:10px;margin-top:4px}
  .labels{margin-top:5px}
  .meta{color:#94a3b8;font-size:12px;white-space:nowrap}
  footer{max-width:1000px;margin:16px auto;padding:0 20px;color:#94a3b8;font-size:12px}
</style></head>
<body>
<header>
  <h1>${esc(meta.repo || 'Repository')} — Issues &amp; Pull Requests</h1>
  <p>${issues.length} issue(s) · ${prs.length} pull request(s) · archived ${esc((meta.backed_up_at || '').slice(0, 10))}</p>
</header>
<div class="wrap">
  <table>
    <thead><tr><th>Ref</th><th>Title</th><th>State</th><th>Author / Date</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px">No issues or pull requests captured.</td></tr>'}</tbody>
  </table>
</div>
<footer>Static archive generated from metadata.json. © Omar Rao · All rights reserved.</footer>
</body></html>`;
}

module.exports = { renderIssuesHtml };
