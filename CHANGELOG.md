# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-15

### Added
- Full GitHub repository backup to Google Drive (code, issues, pull requests, releases, wiki, labels, milestones)
- Full restore from Google Drive back to GitHub
- Web dashboard with Dashboard, Backup, Restore, History, and Settings pages
- GitHub Actions workflow for scheduled daily backup (02:00 UTC) with manual trigger
- GitHub Actions workflow for manual restore with session and repo selection
- Concurrent backup processing with configurable parallelism
- Timestamped backup sessions in Google Drive
- Rotating log files via Winston
- One-time Google OAuth authorisation script (`src/auth/google-auth.js`)
- Static UI preview page (`docs/ui-preview.html`) with no server required
- Job polling in the web UI — live status updates every 3 seconds
- Selective backup and restore (choose specific repos)
- `.env.example` with full configuration reference
