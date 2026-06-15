# 🗄️ GitHub → Google Drive Backup

**Back up every GitHub repository to Google Drive and restore with one click.**

Covers source code, issues, pull requests, releases, wiki, labels, and milestones — with a fully dark web dashboard and automated GitHub Actions workflows.

🌐 **[Live Dashboard](https://omarrao.github.io/github-gdrive-backup/)** · 📦 **[Releases](https://github.com/OmarRao/github-gdrive-backup/releases)** · ⚙️ **[Actions](https://github.com/OmarRao/github-gdrive-backup/actions)**

---

## Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard.svg)

### Backup
![Backup](docs/screenshots/backup.svg)

### Restore
![Restore](docs/screenshots/restore.svg)

### Settings
![Settings](docs/screenshots/settings.svg)

---

## Features

| | |
|---|---|
| **Full backup** | Code (git mirror), issues, PRs, releases, wiki, labels, milestones |
| **Full restore** | Recreates repos on GitHub and pushes all branches + tags |
| **Live web dashboard** | Dark-mode browser UI — trigger backups, monitor runs, manage settings |
| **GitHub Actions** | Scheduled daily backup (02:00 UTC) + manual restore workflow |
| **GitHub Pages hosted** | Dashboard runs at `https://omarrao.github.io/github-gdrive-backup/` — no server needed |
| **Workflow triggering** | Click in the dashboard → fires GitHub Actions via API |
| **Selective backup** | Choose specific repos or process everything |
| **Concurrent** | Configurable parallel repo operations |
| **Rotating logs** | Winston log files with error isolation |

---

## Architecture

```
Browser (GitHub Pages dashboard)
        │  calls GitHub API directly
        ▼
GitHub Actions workflows  ──────────────────────────────┐
  backup.yml  (scheduled daily + manual trigger)        │
  restore.yml (manual trigger)                          │
        │                                               │
        ▼                                               ▼
  Node.js backup code                         Google Drive
  ├── Clone all repos (git mirror)            └── Timestamped session folders
  ├── Fetch issues, PRs, releases                  ├── backup-2026-06-15/
  ├── Fetch wiki, labels, milestones               │   ├── api-service/
  └── Zip + upload to Drive                        │   │   ├── api-service.zip
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
2. Create an **OAuth 2.0 Client ID** (Desktop app)
3. Download the JSON → save as `credentials/google-client-secret.json`
4. Run the one-time auth flow:

```bash
node src/auth/google-auth.js
```

5. Follow the browser prompt — token saved to `credentials/google-token.json` automatically

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

It talks directly to the GitHub API from your browser:
- Enter your GitHub token in **Settings** (stored in `localStorage`, never sent anywhere else)
- Click **Backup** to trigger the `backup.yml` workflow
- Click **Restore** to trigger `restore.yml`
- Watch live run status in **Workflow Runs**

---

## GitHub Actions Setup

Add these **5 secrets** to your repository → **Settings → Secrets → Actions**:

| Secret | Description |
|--------|-------------|
| `GH_BACKUP_TOKEN` | GitHub PAT with `repo`, `read:org`, `read:user` scopes |
| `GH_USER` | Your GitHub username or org to back up |
| `GDRIVE_FOLDER_ID` | Google Drive folder ID |
| `GOOGLE_CLIENT_SECRET` | Full JSON content of `credentials/google-client-secret.json` |
| `GOOGLE_TOKEN` | Full JSON content of `credentials/google-token.json` |

The **backup** workflow runs daily at 02:00 UTC and can be triggered manually from
[Actions → Scheduled Backup → Run workflow](https://github.com/OmarRao/github-gdrive-backup/actions/workflows/backup.yml).

The **restore** workflow is manual-only — trigger from
[Actions → Restore → Run workflow](https://github.com/OmarRao/github-gdrive-backup/actions/workflows/restore.yml).

---

## CLI Reference

```bash
npm run backup    # Back up all repos now
npm run restore   # Restore from latest Drive session
npm start         # Self-hosted web dashboard on http://localhost:3000
npm run dev       # Dev mode with auto-reload (nodemon)
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

# Self-hosted web server
PORT=3000
```

---

## Backup Structure in Google Drive

```
GDRIVE_FOLDER_ID/
└── backup-2026-06-15T02-00-00-000Z/      ← timestamped session
    ├── backup-summary.json               ← success/fail counts
    ├── api-service/
    │   ├── api-service.zip               ← full git mirror (all branches + tags)
    │   ├── api-service-wiki.zip          ← wiki mirror (if exists)
    │   └── metadata.json                 ← issues, PRs, releases, labels, milestones
    └── frontend-app/
        ├── frontend-app.zip
        └── metadata.json
```

---

## Restore Behaviour

- **Creates** the GitHub repo if it doesn't exist (private by default, configurable)
- **Pushes** all branches and tags with `--force` (safe to re-run)
- **Recreates** labels and milestones
- Issues and PRs are preserved in `metadata.json` for reference

---

## Project Structure

```
github-gdrive-backup/
├── .github/workflows/
│   ├── backup.yml          # Daily scheduled + manual backup
│   └── restore.yml         # Manual restore
├── docs/
│   ├── index.html          # GitHub Pages dashboard (dark mode, no server needed)
│   ├── ui-preview.html     # Static UI mockup
│   └── screenshots/        # README screenshots
├── src/
│   ├── auth/google-auth.js # One-time Google OAuth flow
│   ├── backup/
│   │   ├── github.js       # GitHub API client
│   │   ├── gdrive.js       # Google Drive client
│   │   └── index.js        # Backup orchestrator
│   ├── restore/index.js    # Restore orchestrator
│   ├── server/             # Self-hosted Express dashboard
│   │   ├── app.js
│   │   ├── routes/api.js
│   │   └── public/
│   └── logger.js
├── credentials/            # Git-ignored — your OAuth files go here
├── .env.example
├── CHANGELOG.md
└── README.md
```

---

## Security Notes

- `credentials/` and `.env` are in `.gitignore` — **never committed**
- The GitHub Pages dashboard stores your token in `localStorage` only — it is never sent to any third party
- GitHub PAT for backup only needs `repo` + `read:org` + `read:user` — no write scopes required
- The self-hosted web server has no built-in auth — run it locally or behind a reverse proxy

---

## License

MIT — see [LICENSE](LICENSE)
