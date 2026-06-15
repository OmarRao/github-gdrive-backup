# 🗄️ GitHub → Google Drive Backup

Back up every GitHub repository — source code, issues, pull requests, releases, wiki, labels, and milestones — to Google Drive, and restore them with a single command or click.

![UI Preview](docs/screenshots/ui-preview.png)

---

## Features

| | |
|---|---|
| **Full backup** | Code (git mirror), issues, PRs, releases, wiki, labels, milestones |
| **Full restore** | Recreates repos on GitHub and pushes all branches + tags |
| **Web dashboard** | Browser UI for backup, restore, job history, and status |
| **GitHub Actions** | Scheduled daily backup + manual restore workflow |
| **Incremental sessions** | Each backup creates a timestamped folder in Drive |
| **Selective backup** | Choose specific repos or include everything |
| **Concurrent** | Configurable parallel repo processing |
| **Logged** | Rotating log files + console output |

---

## Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### Backup
![Backup](docs/screenshots/backup.png)

### Restore
![Restore](docs/screenshots/restore.png)

### Settings
![Settings](docs/screenshots/settings.png)

> **Live UI preview (no server needed):** open [`docs/ui-preview.html`](docs/ui-preview.html) in your browser.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/github-gdrive-backup.git
cd github-gdrive-backup
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your tokens and folder ID
```

### 3. Set up Google Drive credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Desktop app)
3. Download the JSON and save it as `credentials/google-client-secret.json`
4. Run the one-time auth flow:

```bash
node src/auth/google-auth.js
```

5. Follow the browser prompt — the token is saved automatically to `credentials/google-token.json`

### 4. Create a Google Drive folder

Create a folder in Google Drive, then copy its ID from the URL:

```
https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE
```

Set `GDRIVE_FOLDER_ID=YOUR_FOLDER_ID_HERE` in `.env`.

### 5. Run a backup

```bash
# Back up all repos
npm run backup

# Or launch the web UI
npm start
# → http://localhost:3000
```

---

## GitHub Actions Setup

Add these secrets to your repository (**Settings → Secrets → Actions**):

| Secret | Description |
|--------|-------------|
| `GH_BACKUP_TOKEN` | GitHub PAT with `repo`, `read:org`, `read:user` scopes |
| `GH_USER` | Your GitHub username or org |
| `GDRIVE_FOLDER_ID` | Google Drive folder ID |
| `GOOGLE_CLIENT_SECRET` | Full JSON content of `google-client-secret.json` |
| `GOOGLE_TOKEN` | Full JSON content of `google-token.json` |

The backup workflow runs **daily at 02:00 UTC** automatically, and can be triggered manually from **Actions → Scheduled GitHub → Google Drive Backup → Run workflow**.

The restore workflow is **manual-only** — trigger it from **Actions → Restore from Google Drive → GitHub → Run workflow**.

---

## Configuration Reference

All options are set via environment variables (`.env`):

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

# Web UI
PORT=3000
```

---

## CLI Usage

```bash
# Backup all repos
npm run backup

# Restore from latest backup session
npm run restore

# Start the web dashboard
npm start
```

---

## Backup Structure in Google Drive

```
GDRIVE_FOLDER_ID/
└── backup-2026-06-15T02-00-00-000Z/      ← timestamped session
    ├── backup-summary.json
    ├── api-service/
    │   ├── api-service.zip               ← git mirror (all branches + tags)
    │   ├── api-service-wiki.zip          ← wiki mirror (if exists)
    │   └── metadata.json                 ← issues, PRs, releases, labels, milestones
    └── frontend-app/
        ├── frontend-app.zip
        └── metadata.json
```

---

## Restore Behaviour

- **Creates** the GitHub repo if it doesn't exist (private by default)
- **Pushes** all branches and tags (`--force` to handle re-restores)
- **Recreates** labels and milestones
- Issues and PRs are stored in `metadata.json` for reference (GitHub API does not support creating issues programmatically at scale without rate limits)

---

## Project Structure

```
github-gdrive-backup/
├── .github/workflows/
│   ├── backup.yml          # Scheduled + manual backup
│   └── restore.yml         # Manual restore
├── src/
│   ├── auth/
│   │   └── google-auth.js  # One-time Google OAuth flow
│   ├── backup/
│   │   ├── github.js       # GitHub API: clone, issues, PRs, releases, wiki
│   │   ├── gdrive.js       # Google Drive: upload, list, download
│   │   └── index.js        # Backup orchestrator
│   ├── restore/
│   │   └── index.js        # Restore orchestrator
│   ├── server/
│   │   ├── app.js          # Express server
│   │   ├── routes/api.js   # REST API endpoints
│   │   └── public/         # Web dashboard (HTML + CSS + JS)
│   └── logger.js
├── docs/
│   ├── ui-preview.html     # Static UI mockup (no server needed)
│   └── screenshots/
├── credentials/            # Git-ignored — your OAuth files go here
├── .env.example
└── README.md
```

---

## Security Notes

- `credentials/` is in `.gitignore` — never commit tokens
- The web UI has no built-in authentication — run it on localhost or behind a reverse proxy with auth
- GitHub PAT only needs `repo` + `read:org` + `read:user` — no write scopes needed for backup

---

## License

MIT
