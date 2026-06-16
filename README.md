# 🗄️ GitHub → Google Drive Backup

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Automated-2ea44f?logo=github-actions&logoColor=white)](https://github.com/OmarRao/github-gdrive-backup/actions)
[![GitHub Pages](https://img.shields.io/badge/Live%20Dashboard-GitHub%20Pages-0969da?logo=github&logoColor=white)](https://omarrao.github.io/github-gdrive-backup/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**Back up every GitHub repository to Google Drive — and restore with one click.**

Covers source code, issues, pull requests, releases, wiki, labels, and milestones. Includes a clean light-mode web dashboard hosted on GitHub Pages, plus fully automated GitHub Actions workflows for daily scheduled backups and on-demand restores.

🌐 **[Live Dashboard](https://omarrao.github.io/github-gdrive-backup/)** &nbsp;·&nbsp; 📦 **[Releases](https://github.com/OmarRao/github-gdrive-backup/releases)** &nbsp;·&nbsp; ⚙️ **[Actions](https://github.com/OmarRao/github-gdrive-backup/actions)**

---

## Screenshots

### Dashboard

The main overview at a glance — repository count, backup sessions, time since last backup, and live workflow run status in a scrollable table. Light-mode, no server required, hosted directly on GitHub Pages.

![Dashboard](docs/screenshots/dashboard.svg)

---

### Backup

Select individual repositories or back everything up in one shot. Choose exactly what to include — source code, issues, PRs, releases, wiki, labels, and milestones — then fire the GitHub Actions workflow with a single click.

![Backup](docs/screenshots/backup.svg)

---

### Restore

Browse timestamped backup sessions pulled live from your Google Drive folder. Pick a session, optionally specify repos and a target owner, and trigger the restore workflow directly from the dashboard.

![Restore](docs/screenshots/restore.svg)

---

### Settings

Configure your GitHub token, connect Google Drive via OAuth, verify your backup folder, and find all required Actions secrets in one place. Tokens are stored in `localStorage` only — never sent to a third party.

![Settings](docs/screenshots/settings.svg)

---

## Features

| Feature | Details |
|---|---|
| **Full backup** | Source code (git mirror, all branches + tags), issues, PRs, releases, wiki, labels, milestones |
| **Full restore** | Recreates repos on GitHub and pushes all branches, tags, labels, and milestones |
| **Light-mode dashboard** | Clean browser UI hosted on GitHub Pages — trigger backups, monitor runs, manage settings |
| **GitHub Actions** | Scheduled daily backup (02:00 UTC) + manual restore workflow — fully automated |
| **No server needed** | Dashboard runs at `https://omarrao.github.io/github-gdrive-backup/` — pure static HTML |
| **Workflow triggering** | One click in the dashboard fires GitHub Actions via the GitHub API |
| **Selective backup** | Choose specific repos or all; choose exactly what data to include |
| **Concurrent processing** | Configurable parallel repo operations for faster backups |
| **Drive session browser** | Connect Google Drive in the dashboard to browse real backup sessions live |
| **Rotating logs** | Winston log files with error isolation, uploaded as GitHub Actions artifacts |

---

## Architecture

```
Browser (GitHub Pages dashboard — light mode, no server)
        │  talks directly to GitHub API + Google Drive API
        ▼
GitHub Actions workflows  ─────────────────────────────────────┐
  backup.yml  (scheduled daily 02:00 UTC + manual trigger)     │
  restore.yml (manual trigger)                                  │
        │                                                       │
        ▼                                                       ▼
  Node.js backup code                               Google Drive
  ├── Clone all repos (git mirror)                  └── Timestamped session folders
  ├── Fetch issues, PRs, releases                       ├── backup-2026-06-15T02-00-00-000Z/
  ├── Fetch wiki, labels, milestones                    │   ├── api-service/
  └── Zip + upload to Drive                             │   │   ├── api-service.zip
                                                        │   │   └── metadata.json
                                                        │   └── backup-summary.json
                                                        └── ...
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/OmarRao/github-gdrive-backup.git
cd github-gdrive-backup
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in GITHUB_TOKEN, GITHUB_USER, GDRIVE_FOLDER_ID
```

### 3. Set up Google Drive credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `https://omarrao.github.io` as an **Authorised JavaScript origin**
4. Add `http://localhost` as an **Authorised redirect URI**
5. Download the JSON → save as `credentials/google-client-secret.json`
6. Run the one-time auth script:

```bash
python get_token.py
```

7. Follow the browser prompt — token is saved to `credentials/google-token.json` automatically

### 4. Create a Google Drive folder

Create a folder in Drive, then copy its ID from the URL:

```
https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE
```

Set `GDRIVE_FOLDER_ID=YOUR_FOLDER_ID_HERE` in `.env`.

### 5. Run your first backup

```bash
# CLI — back up all repos
npm run backup

# Or launch the self-hosted web dashboard
npm start
# → http://localhost:3000
```

---

## GitHub Pages Dashboard

The `docs/index.html` dashboard is hosted on GitHub Pages at:

**https://omarrao.github.io/github-gdrive-backup/**

It communicates directly with the GitHub API and Google Drive API from your browser:

- Enter your GitHub token in **Settings → GitHub** (stored in `localStorage` only — never sent anywhere else)
- Click **Sign in with Google** in **Settings → Google Drive** to browse backup sessions live
- Click **Backup** to trigger the `backup.yml` workflow directly from the dashboard
- Click **Restore** to trigger `restore.yml` with a selected session
- Watch live run status in **Workflow Runs**

> **Security:** Your GitHub token and Google Drive token never leave your browser. They are stored in `localStorage` and sent only to `api.github.com` and `www.googleapis.com` respectively.

---

## GitHub Actions Setup

Add these **5 secrets** to your repository → **Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `GH_BACKUP_TOKEN` | GitHub PAT with `repo`, `workflow`, `read:org`, `read:user` scopes |
| `GH_USER` | Your GitHub username or org to back up |
| `GDRIVE_FOLDER_ID` | Google Drive folder ID (from the folder URL) |
| `GOOGLE_CLIENT_SECRET` | Full JSON content of `credentials/google-client-secret.json` |
| `GOOGLE_TOKEN` | Full JSON content of `credentials/google-token.json` (from one-time auth) |

The **backup** workflow runs daily at 02:00 UTC and can be triggered manually from
[Actions → Scheduled Backup → Run workflow](https://github.com/OmarRao/github-gdrive-backup/actions/workflows/backup.yml).

The **restore** workflow is manual-only — trigger from
[Actions → Restore → Run workflow](https://github.com/OmarRao/github-gdrive-backup/actions/workflows/restore.yml).

---

## CLI Reference

```bash
npm run backup       # Back up all repos now
npm run restore      # Restore from latest Drive session
npm start            # Self-hosted web dashboard on http://localhost:3000
npm run dev          # Dev mode with auto-reload (nodemon)
python get_token.py  # One-time Google OAuth flow → credentials/google-token.json
```

---

## Configuration Reference

```env
# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_USER=your-username

# Google Drive
GOOGLE_CLIENT_SECRET_PATH=./credentials/google-client-secret.json
GOOGLE_TOKEN_PATH=./credentials/google-token.json
GDRIVE_FOLDER_ID=1abc...xyz

# Backup behaviour
BACKUP_INCLUDE=code,issues,pull_requests,releases,wiki,labels,milestones
BACKUP_CONCURRENCY=3
BACKUP_TMP_DIR=./tmp

# Self-hosted web server (optional)
PORT=3000
```

---

## Backup Structure in Google Drive

```
GDRIVE_FOLDER_ID/
└── backup-2026-06-15T02-00-00-000Z/      ← timestamped session (one per run)
    ├── backup-summary.json               ← success/fail counts, timestamps
    ├── api-service/
    │   ├── api-service.zip               ← full git mirror (all branches + tags)
    │   ├── api-service-wiki.zip          ← wiki mirror (if the repo has one)
    │   └── metadata.json                 ← issues, PRs, releases, labels, milestones
    └── frontend-app/
        ├── frontend-app.zip
        └── metadata.json
```

---

## Restore Behaviour

- **Creates** the GitHub repo if it doesn't exist (private by default, configurable)
- **Pushes** all branches and tags with `--force` (safe to re-run)
- **Recreates** labels and milestones exactly as they were
- Issues and PRs are preserved in `metadata.json` for reference (GitHub API does not support creating issues via restore)

---

## Project Structure

```
github-gdrive-backup/
├── .github/workflows/
│   ├── backup.yml          # Daily scheduled (02:00 UTC) + manual backup
│   └── restore.yml         # Manual restore
├── docs/
│   ├── index.html          # GitHub Pages dashboard (light mode, no server needed)
│   ├── ui-preview.html     # Static UI mockup
│   └── screenshots/        # README screenshots (SVG)
├── src/
│   ├── auth/google-auth.js # One-time Google OAuth flow (Node.js)
│   ├── backup/
│   │   ├── github.js       # GitHub API client (repos, issues, PRs, releases, wiki)
│   │   ├── gdrive.js       # Google Drive client (upload, folder management)
│   │   └── index.js        # Backup orchestrator
│   ├── restore/index.js    # Restore orchestrator
│   ├── server/             # Optional self-hosted Express dashboard
│   │   ├── app.js
│   │   ├── routes/api.js
│   │   └── public/
│   └── logger.js
├── credentials/            # Git-ignored — your OAuth files go here
├── get_token.py            # One-time Python OAuth flow (alternative to Node auth)
├── .env.example
├── CHANGELOG.md
└── README.md
```

---

## Security Notes

- `credentials/` and `.env` are in `.gitignore` — **never committed to the repository**
- The GitHub Pages dashboard stores tokens in `localStorage` only — **never sent to any third party**
- GitHub PAT needs `repo`, `workflow`, `read:org`, `read:user` — no destructive write scopes required
- Google Drive token is scoped to `drive.file` (Actions) or `drive.readonly` (dashboard) — minimal permissions
- The self-hosted web server has no built-in authentication — run it locally or behind a reverse proxy

---

## License

MIT — see [LICENSE](LICENSE)

---

## Author

**Omar Rao** — Engineer, Data Resilience, Cybersecurity & Privacy

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Omar%20Rao-0a66c2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/omarrao/)
[![Substack](https://img.shields.io/badge/Substack-omarrao-ff6719?logo=substack&logoColor=white)](https://substack.com/@omarrao)

> Writing about data resilience, backup engineering, and practical cybersecurity at [omarrao.substack.com](https://omarrao.substack.com/)
