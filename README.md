# GitHub → Google Drive Backup

[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb?logo=opensourceinitiative&logoColor=white)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/Automated-GitHub%20Actions-1a7f37?logo=github-actions&logoColor=white)](https://github.com/OmarRao/github-gdrive-backup/actions)
[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-GitHub%20Pages-2563eb?logo=github&logoColor=white)](https://omarrao.github.io/github-gdrive-backup/)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Google Drive](https://img.shields.io/badge/Storage-Google%20Drive-4285F4?logo=googledrive&logoColor=white)](https://drive.google.com/)

**Back up every GitHub repository to Google Drive — code, issues, PRs, releases, wiki, labels, milestones — and restore with one click.**

Runs automatically every day at 02:00 UTC via GitHub Actions. A light-mode dashboard hosted on GitHub Pages lets you trigger backups, browse sessions, generate reports, and manage settings — no server required.

**[Live Dashboard](https://omarrao.github.io/github-gdrive-backup/)** &nbsp;·&nbsp; **[Releases](https://github.com/OmarRao/github-gdrive-backup/releases)** &nbsp;·&nbsp; **[Actions](https://github.com/OmarRao/github-gdrive-backup/actions)**

---

## Screenshots

### Dashboard

The main overview — repository count, backup session count, time since last run, and active workflow status. The hero banner shows feature badges and the sidebar provides instant navigation with live connection status indicators.

![Dashboard](docs/screenshots/dashboard.svg)

---

### Backup

Select individual repos or back up everything in one shot. Toggle exactly what to include — source code, issues, PRs, releases, wiki, labels, and milestones — then trigger the GitHub Actions workflow instantly from the dashboard.

![Backup](docs/screenshots/backup.svg)

---

### Restore

Browse timestamped backup sessions loaded live from Google Drive. Select a session, optionally filter repos and specify a target owner, then trigger the restore workflow directly without leaving the dashboard.

![Restore](docs/screenshots/restore.svg)

---

### Reports

Track backup success rates, consecutive-day streaks, failure counts, and full run history. Every backup and restore run is listed with its status, trigger type, duration, and a direct link. Export the full history as a CSV with one click.

![Reports](docs/screenshots/reports.svg)

---

### Settings

Configure your GitHub Personal Access Token, connect Google Drive via OAuth, verify your backup folder ID, and review all required Actions secrets. Tokens are stored in `localStorage` only — never sent to any third party.

![Settings](docs/screenshots/settings.svg)

---

## Features

| Feature | Details |
|---|---|
| **Full backup** | Git mirror (all branches + tags), issues, PRs, releases, wiki, labels, milestones |
| **Full restore** | Recreates repos on GitHub, pushes all branches and tags, rebuilds labels and milestones |
| **Reports dashboard** | Success rate, streak counter, per-run breakdown, CSV export |
| **Light-mode dashboard** | Static HTML on GitHub Pages — no server, no build step |
| **Daily automation** | GitHub Actions cron at 02:00 UTC, plus manual trigger at any time |
| **Selective backup** | Pick specific repos and choose exactly which data types to include |
| **Private repo support** | Backs up both public and private repositories via PAT with `repo` scope |
| **Drive session browser** | Connect Google Drive in the dashboard to browse sessions live |
| **Concurrent processing** | Configurable parallel operations — default 3 repos at once |
| **Rotating logs** | Winston log files uploaded as GitHub Actions artifacts, retained 30 days |
| **Dark mode** | Toggle between light and dark themes — persists in browser |
| **Keyboard shortcuts** | `D/B/R/W/P/S` navigate pages, `?` shows shortcut help |
| **Toast notifications** | Non-blocking success/error feedback on all workflow actions |
| **Restore preview** | Confirm modal shows session, target owner, and impact before restore |
| **Multi-account** | Add multiple GitHub accounts/orgs and switch between them |
| **Retention policy** | UI to configure auto-deletion of old Drive sessions (30–365 days) |
| **Failure alerts** | Slack and email notifications when backup fails (`notify.yml`) |
| **Incremental backup** | Optional mode that only backs up repos changed since last session |
| **Auto-cleanup** | Weekly workflow removes Drive sessions beyond retention threshold |
| **Health status** | `docs/status.json` updated on each run for badge/monitoring use |

---

## Architecture

```
Browser (GitHub Pages — static, no server)
        │  GitHub API + Google Drive API called directly from browser
        ▼
GitHub Actions Workflows
  backup.yml   — daily cron 02:00 UTC + manual dispatch
  restore.yml  — manual dispatch only
        │
        ▼
Node.js 22 (ubuntu-latest runner)
  ├── Clone repos via git mirror (all branches + tags)
  ├── Fetch issues, PRs, releases, wiki, labels, milestones
  ├── Zip per-repo archive + metadata.json
  └── Upload to Google Drive → timestamped session folder

Google Drive
  └── backup-2026-06-15T02-00-00-000Z/
      ├── backup-summary.json
      ├── api-service/
      │   ├── api-service.zip
      │   └── metadata.json
      └── frontend-app/
          ├── frontend-app.zip
          └── metadata.json
```

---

## Quick Start

### 1. Fork and clone

```bash
git clone https://github.com/OmarRao/github-gdrive-backup.git
cd github-gdrive-backup
npm install
```

### 2. Create Google Cloud OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Enable the **Google Drive API** for your project
3. Create an **OAuth 2.0 Client ID** — type: **Web application**
4. Add `https://YOUR_GITHUB_USERNAME.github.io` as an **Authorised JavaScript origin**
5. Add `http://localhost:8080` as an **Authorised redirect URI**
6. Download the JSON and save as `credentials/google-client-secret.json`

### 3. Run the one-time OAuth flow

```bash
python get_token.py
```

Follow the browser prompt. The token is auto-captured and saved to `credentials/google-token.json`.

### 4. Create a Google Drive backup folder

Create a folder in Drive. Copy the folder ID from its URL:

```
https://drive.google.com/drive/folders/YOUR_FOLDER_ID
```

### 5. Add GitHub Actions secrets

Go to **Settings → Secrets and variables → Actions** and add these 5 secrets:

| Secret | Value |
|--------|-------|
| `GH_BACKUP_TOKEN` | GitHub PAT with `repo`, `workflow`, `read:org`, `read:user` scopes |
| `GH_USER` | Your GitHub username or organisation name |
| `GDRIVE_FOLDER_ID` | The folder ID from step 4 |
| `GOOGLE_CLIENT_SECRET` | Full JSON contents of `credentials/google-client-secret.json` |
| `GOOGLE_TOKEN` | Full JSON contents of `credentials/google-token.json` |

**Optional notification secrets:**

| Secret | Value |
|--------|-------|
| `SLACK_WEBHOOK_URL` | Incoming webhook URL for Slack failure alerts |
| `NOTIFY_EMAIL` | Gmail address for email failure alerts |
| `NOTIFY_EMAIL_PASSWORD` | Gmail app password (not your account password) |

### 6. Trigger your first backup

Go to **Actions → Scheduled GitHub → Google Drive Backup → Run workflow**, or open the live dashboard and click **Backup → Trigger Backup Workflow**.

---

## Dashboard Pages

The dashboard at **https://omarrao.github.io/github-gdrive-backup/** has six pages:

| Page | What it does |
|------|-------------|
| **Dashboard** | Stats overview and recent workflow run history |
| **Backup** | Select repos, choose data types, toggle incremental mode, trigger backup |
| **Restore** | Browse Drive sessions, preview impact, trigger restore |
| **Workflow Runs** | Full list of all backup and restore runs with live status |
| **Reports** | Success rate, streak, run breakdown table, CSV export |
| **Settings — GitHub** | GitHub token, username, multi-account management |
| **Settings — Google Drive** | OAuth connect, folder ID |
| **Settings — Retention** | Configure auto-deletion period and schedule |
| **Settings — Actions Secrets** | Reference for all required secrets |
| **Settings — Setup Guide** | Step-by-step onboarding |

> **Security:** GitHub token and Drive token are stored in `localStorage` only. They are sent to `api.github.com` and `www.googleapis.com` respectively — no third party ever receives them.

---

## Keyboard Shortcuts

Press `?` anywhere in the dashboard to open the shortcuts panel.

| Key | Action |
|-----|--------|
| `D` | Dashboard |
| `B` | Backup |
| `R` | Restore |
| `W` | Workflow Runs |
| `P` | Reports |
| `S` | Settings |
| `?` | Show shortcut help |
| `Esc` | Close modals |

---

## Configuration Reference

```env
GITHUB_TOKEN=ghp_...
GITHUB_USER=your-username

GOOGLE_CLIENT_SECRET_PATH=./credentials/google-client-secret.json
GOOGLE_TOKEN_PATH=./credentials/google-token.json
GDRIVE_FOLDER_ID=1abc...xyz

BACKUP_INCLUDE=code,issues,pull_requests,releases,wiki,labels,milestones
BACKUP_CONCURRENCY=3
BACKUP_TMP_DIR=./tmp

PORT=3000
```

---

## Backup Structure in Google Drive

```
GDRIVE_FOLDER_ID/
└── backup-2026-06-15T02-00-00-000Z/
    ├── backup-summary.json
    ├── repo-name/
    │   ├── repo-name.zip          — full git mirror (all branches + tags)
    │   ├── repo-name-wiki.zip     — wiki mirror (if repo has one)
    │   └── metadata.json          — issues, PRs, releases, labels, milestones
    └── ...
```

---

## Restore Behaviour

- Creates the target GitHub repo if it does not exist (private by default)
- Pushes all branches and tags with `--force` — safe to re-run
- Recreates labels and milestones exactly as backed up
- Issues and PRs are preserved in `metadata.json` — the GitHub API does not support programmatic issue creation

---

## Backup Retention & Cleanup

Configure automatic deletion of old sessions in **Settings → Retention**. Available periods: 30, 60, 90, 180 days, or 1 year.

The `cleanup.yml` workflow runs every Sunday at 03:00 UTC (or on demand). It paginates through all session folders in your Drive backup folder and deletes any created before the retention cutoff.

To trigger manually: **Settings → Retention → Run Cleanup Workflow**, or via Actions → Cleanup Old Backup Sessions → Run workflow.

---

## CLI Reference

```bash
npm run backup        # Back up all repos immediately
npm run restore       # Restore from the latest Drive session
npm start             # Self-hosted Express dashboard on http://localhost:3000
npm run dev           # Dev mode with nodemon auto-reload
python get_token.py   # One-time Google OAuth → credentials/google-token.json
```

---

## Project Structure

```
github-gdrive-backup/
├── .github/workflows/
│   ├── backup.yml          — daily cron + manual backup
│   └── restore.yml         — manual restore
├── docs/
│   ├── index.html          — GitHub Pages dashboard
│   ├── ui-preview.html     — screenshot gallery
│   └── screenshots/        — SVG mockups for README
├── src/
│   ├── auth/google-auth.js
│   ├── backup/
│   │   ├── github.js       — GitHub API client
│   │   ├── gdrive.js       — Google Drive client
│   │   └── index.js        — backup orchestrator
│   ├── restore/index.js    — restore orchestrator
│   ├── server/             — optional self-hosted Express server
│   └── logger.js
├── credentials/            — git-ignored, OAuth files go here
├── get_token.py            — one-time Google OAuth script
├── .env.example
└── README.md
```

---

## Failure Alerts

When a backup run fails, `notify.yml` automatically fires and:
- Posts a Slack message (if `SLACK_WEBHOOK_URL` secret is set)
- Sends an email (if `NOTIFY_EMAIL` and `NOTIFY_EMAIL_PASSWORD` secrets are set)
- Updates `docs/status.json` with the failure status and run URL

Add either or both secrets to **Settings → Secrets and variables → Actions** to activate alerts.

---

## Security

- `credentials/` and `.env` are in `.gitignore` — never committed
- Dashboard tokens stored in `localStorage` only — never sent to any third party
- GitHub PAT scopes: `repo`, `workflow`, `read:org`, `read:user` — read-only for backup, no destructive permissions
- Google Drive token scoped to `drive.file` in Actions, `drive.readonly` in the dashboard
- Self-hosted Express server has no built-in auth — run locally or behind a reverse proxy

---

## License

MIT — see [LICENSE](LICENSE)

---

## Author

**Omar Rao** — Engineer, Data Resilience, Cybersecurity & Privacy

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Omar%20Rao-0a66c2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/omarrao/)
[![Substack](https://img.shields.io/badge/Substack-omarrao-ff6719?logo=substack&logoColor=white)](https://substack.com/@omarrao)

> Writing about data resilience, backup engineering, and practical cybersecurity at [omarrao.substack.com](https://omarrao.substack.com/)
