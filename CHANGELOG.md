# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] — 2026-06-22

### Added
- Dark mode with persistent theme toggle
- Keyboard shortcuts (D/B/R/W/P/S/?) with help modal
- Toast notifications replacing all browser alerts
- Restore preview modal with session and impact warning
- Multi-account support (Settings → Accounts)
- Retention policy UI (Settings → Retention)
- Interactive onboarding wizard in Settings → Setup Guide
- Backup diff view on Workflow Runs page (live Drive API + mock fallback)
- Backup size chart on Reports page (live Drive API + mock fallback)
- Search and status filter on Workflow Runs page
- Search and date filter on Reports run table
- Failure notification workflow (notify.yml) — updates docs/status.json
- Weekly cleanup workflow (cleanup.yml) — auto-deletes old Drive sessions
- Incremental backup mode via workflow_dispatch input
- Live Backup Status badge in README via shields.io
- CONTRIBUTING.md and GitHub Template repo setup
- Mobile-responsive layout fixes

### Changed
- All dashboard icons replaced with stroke-based SVG primitives
- All screenshots updated to reflect current feature set
- docs/status.json now updated on both success (backup.yml) and failure (notify.yml)

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
