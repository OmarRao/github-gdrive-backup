# Contributing

## Project Structure

```
github-gdrive-backup/
├── .github/workflows/
│   ├── backup.yml        — daily cron (02:00 UTC) + manual dispatch
│   ├── restore.yml       — manual dispatch only
│   ├── cleanup.yml       — weekly retention cleanup
│   └── notify.yml        — failure alerts (Slack / email)
├── docs/
│   ├── index.html        — GitHub Pages dashboard (single file, no build step)
│   ├── status.json       — updated on each run; drives the README badge
│   └── screenshots/      — SVG mockups used in README
├── src/
│   ├── auth/google-auth.js
│   ├── backup/           — GitHub client, Drive client, orchestrator
│   ├── restore/          — restore orchestrator
│   ├── server/           — optional self-hosted Express dashboard
│   └── logger.js
├── credentials/          — git-ignored; OAuth files live here locally
├── get_token.py          — one-time Google OAuth flow
└── .env.example
```

## Running Locally

```bash
npm install           # install Node dependencies
python get_token.py   # one-time Google OAuth → credentials/google-token.json
npm start             # self-hosted Express dashboard at http://localhost:3000
npm run dev           # same with nodemon auto-reload
npm run backup        # run a backup immediately
npm run restore       # restore from the latest Drive session
```

Copy `.env.example` to `.env` and fill in your values before running.

## Dashboard Development

`docs/index.html` is a self-contained single-page app — vanilla JS, inline CSS, no build step.

To iterate on it:

1. Open `docs/index.html` directly in a browser, **or** run `npm start` and visit `http://localhost:3000`.
2. Edit the file and hard-refresh. No bundler, no compilation.
3. CSS uses custom properties (`--color-*`, `--radius`, etc.) defined at the top of the `<style>` block — update those to restyle globally.
4. All API calls go directly to `api.github.com` and `www.googleapis.com` from the browser. No backend proxy is involved.

Keep the dashboard dependency-free. Do not add `<script src="...">` CDN imports.

## Workflow Changes

`backup.yml` and `restore.yml` run on `ubuntu-latest` with Node.js 22.

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `GH_BACKUP_TOKEN` | GitHub PAT (`repo`, `workflow`, `read:org`, `read:user`) |
| `GH_USER` | GitHub username or org to back up |
| `GDRIVE_FOLDER_ID` | Target Drive folder ID |
| `GOOGLE_CLIENT_SECRET` | Full JSON of `credentials/google-client-secret.json` |
| `GOOGLE_TOKEN` | Full JSON of `credentials/google-token.json` |

Optional notification secrets: `SLACK_WEBHOOK_URL`, `NOTIFY_EMAIL`, `NOTIFY_EMAIL_PASSWORD`.

When editing a workflow file, test with **Actions → Run workflow** (manual dispatch) before relying on the cron trigger.

## Adding a Feature

1. Fork the repo and create a branch: `git checkout -b feature/my-feature`
2. Make your changes. Keep commits focused and descriptive.
3. Test locally (`npm run backup` or open the dashboard).
4. Open a PR against `main` with a clear description of what and why.

For larger changes, open an issue first to discuss the approach.

## Code Style

- **Vanilla JS only** in `docs/index.html` — no frameworks, no bundler, no CDN imports.
- CSS uses custom properties; avoid hard-coded hex colours outside the `:root` block.
- Node.js code follows the existing patterns in `src/` (CommonJS, async/await, Winston logging).
- No linter is enforced — keep formatting consistent with the surrounding code.

## Secrets & Credentials

**Never commit:**
- `credentials/` — contains OAuth client secrets and tokens
- `.env` — contains local environment variables
- Any file ending in `*token*`, `*secret*`, `*key*`

These paths are already in `.gitignore`. Double-check `git status` before pushing.
