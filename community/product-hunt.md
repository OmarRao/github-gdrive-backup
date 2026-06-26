# Product Hunt Launch

**Tagline:** GitHub backup to Google Drive — no server, no cost, just Actions

**Description:**

github-gdrive-backup automatically backs up all your GitHub repositories to Google Drive using only GitHub Actions. No server to maintain, no monthly fee, no data leaving your own accounts.

Set it up in 10 minutes: fork the repo, add 5 secrets, done. Your code, issues, PRs, releases, and wikis are zipped and uploaded on a daily schedule.

Built for engineers who've been burned by losing repos, and compliance teams who need audit trails.

**Key features:**
- Daily automated backups via GitHub Actions cron
- Static dashboard on GitHub Pages — no server needed
- AES-256 encryption for backup zips
- SHA-256 integrity hashing with manifest.json
- Audit log committed to the repo after every run
- Restore dry-run mode
- GitLab source support
- Multi-org and multi-account GitHub support
- S3 and Azure as alternative storage targets
- Compliance PDF export
