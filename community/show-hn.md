# Show HN Submission

**Title:** Show HN: GitHub backup to Google Drive using only GitHub Actions (no server)

**Body:**

I built a tool that backs up all your GitHub repos (code, issues, PRs, releases, wikis) to Google Drive on a schedule using only GitHub Actions — no server, no database, no paid service.

**How it works:**
- Fork the repo and set 5 GitHub secrets (Drive credentials + GH token)
- A workflow runs daily at 2am, zips all your repos, and uploads them to Drive
- A static dashboard on GitHub Pages shows backup status, run history, and lets you trigger restores

**What's included:** incremental backups, multi-org support, S3/Azure as alternative storage, SHA-256 integrity hashing, AES-256 encryption, audit log, compliance PDF export, Slack/Teams webhook notifications, CLI tool, restore dry-run mode, GitLab source support, self-hosted runner support, and a point-in-time session browser.

Live demo: https://omarrao.github.io/github-gdrive-backup/
GitHub: https://github.com/OmarRao/github-gdrive-backup
