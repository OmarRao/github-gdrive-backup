# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (main) | ✅ |
| older commits | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private Security Advisory system:

1. Go to the [Security Advisories](https://github.com/OmarRao/github-gdrive-backup/security/advisories/new) page
2. Click **"New draft security advisory"**
3. Fill in the affected component, severity, and description
4. Submit — this opens a private discussion between you and the maintainer

You will receive a response within **48 hours**. If the vulnerability is confirmed, a fix will be prioritised and a CVE will be requested if applicable.

## Scope

The following are in scope for security reports:

- **Credential exposure** — GitHub tokens, Google Drive tokens, or encryption keys leaking via logs, artifacts, or committed files
- **Backup integrity** — ability to tamper with backup zips or manifest.json without detection
- **Restore safety** — path traversal or arbitrary file write during restore
- **Workflow injection** — untrusted input reaching `run:` steps in GitHub Actions workflows
- **Dashboard XSS** — cross-site scripting in `docs/index.html` via Drive/GitHub API data
- **Audit log tampering** — ability to modify `docs/audit.log` without a visible git commit

## Out of Scope

- Vulnerabilities in GitHub Actions itself, Google Drive, or GitHub Pages infrastructure
- Rate limiting (covered by the built-in retry logic)
- Social engineering attacks

## Security Features

This project includes the following built-in protections:

| Feature | Details |
|---------|---------|
| Secret scanning | GitHub secret scanning enabled — push protection blocks accidental token commits |
| Dependabot | Automated dependency vulnerability alerts and PRs |
| AES-256 encryption | Optional zip encryption via `BACKUP_ENCRYPTION_KEY` secret |
| SHA-256 integrity | `manifest.json` per session, verified before restore |
| Audit log | Append-only `docs/audit.log` committed to git — tamper-evident |
| Token isolation | Tokens stored in `localStorage` only, sent exclusively to their respective APIs |

## Disclosure Policy

Once a fix is merged, a public Security Advisory will be published with full details and credit to the reporter (unless anonymity is requested).
