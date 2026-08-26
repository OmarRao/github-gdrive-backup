# Dependency License Review

**Technical inventory — not legal advice.** This document is a factual snapshot of
the licenses declared by this project's dependencies to support the maintainer's
own review. It does **not** assert that the project is legally compliant, and it
is not a substitute for review by a qualified attorney.

- Date of snapshot: 2026-07-17
- Package manager: npm (Node.js)
- Source of license data: each package's own `package.json` `license` field and
  the npm registry.

---

## Direct production dependencies

| Package | Version range | Declared license |
|---|---|---|
| `@aws-sdk/client-s3` | `^3.600.0` | Apache-2.0 |
| `@azure/storage-blob` | `^12.24.0` | MIT |
| `@octokit/rest` | `^20.1.1` | MIT |
| `archiver` | `^7.0.1` | MIT |
| `axios` | `^1.7.9` | MIT |
| `dotenv` | `^16.4.5` | BSD-2-Clause |
| `express` | `^4.21.2` | MIT |
| `extract-zip` | `^2.0.1` | BSD-2-Clause |
| `googleapis` | `^144.0.0` | Apache-2.0 |
| `multer` | `^2.2.0` | MIT |
| `simple-git` | `^3.27.0` | MIT |
| `winston` | `^3.17.0` | MIT |

**Override:** `uuid` is pinned to `^11.1.1` via `overrides` (MIT) to remediate a
transitive advisory. This does not change any dependency's license declaration.

## Direct development dependencies

| Package | Version range | Declared license |
|---|---|---|
| `eslint` | `^9.0.0` | MIT |
| `globals` | `^15.0.0` | MIT |
| `jest` | `^29.7.0` | MIT |
| `nodemon` | `^3.1.9` | MIT |

---

## Transitive dependency license distribution

Scan of the installed `node_modules` tree (declared licenses):

| License | Package count |
|---|---|
| MIT | 502 |
| Apache-2.0 | 63 |
| ISC | 53 |
| BSD-3-Clause | 18 |
| BSD-2-Clause | 10 |
| BlueOak-1.0.0 | 5 |
| MIT OR CC0-1.0 | 2 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| 0BSD | 1 |
| BSD (unspecified variant) | 1 |

---

## Dependencies with missing or unknown licenses

- **None detected.** Every scanned package declared a license (0 packages with an
  empty or `UNKNOWN` license field).
- One package declares a bare `"BSD"` without a specific variant — noted for
  awareness; typically resolves to BSD-2/3-Clause.

## Strong copyleft / source-available / non-commercial / custom terms

- **None detected.** The scan found **no** GPL, AGPL, LGPL, MPL, EUPL, CDDL, OSL,
  SSPL, BUSL, Commons-Clause, Prosperity, or non-commercial ("CC-BY-NC") licensed
  dependencies.
- **Items worth noting (permissive, but non-default):**
  - `Python-2.0` (1 package) — permissive.
  - `CC-BY-4.0` (1 package) — a Creative Commons license; typically attached to
    data/assets rather than code. Worth confirming what artifact it covers.
  - `BlueOak-1.0.0` (5 packages) — a modern permissive license.

## Vendored / copied third-party code

- **None found in-tree.** All first-party source under `src/`, `tests/`,
  `scripts/`, `docs/`, and `get_token.py` is authored by the project owner. No
  third-party code appears to be copied or vendored into the repository; all
  third-party code is consumed via npm and lives in `node_modules/` (not
  committed).

## Items flagged for legal review

The following are surfaced for the owner/attorney to consider — this list is
informational only:

1. **AGPL-3.0 outbound vs. permissive inbound.** The project's chosen outbound
   license is AGPL-3.0. Its dependencies are permissive (MIT/Apache/BSD/ISC/etc.),
   which is the common and generally-workable direction, but the maintainer should
   confirm that redistributing them under an AGPL-3.0 combined work meets each
   permissive license's attribution/notice requirements.
2. **Apache-2.0 NOTICE files** (`@aws-sdk/client-s3`, `googleapis`, and transitive
   Apache packages) — verify any required NOTICE attributions are preserved in
   distributions.
3. **`CC-BY-4.0` and bare `BSD` packages** — confirm the specific package and what
   it covers.
4. **Commercial-license offering** — when granting the separate commercial license,
   confirm that the rights conveyed are limited to the first-party code and do not
   purport to relicense third-party dependencies.

Re-run this inventory whenever dependencies change (e.g. after Dependabot updates).

## Known security advisories (open)

| Package | Advisory | Severity | Fix | Status |
|---|---|---|---|---|
| `extract-zip` | [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) — unvalidated symlink path traversal during extraction | High | **No patched version available** | Tracked follow-up |

**Where it's used:** restore only (`src/restore/index.js`) — extracting a repo's
zip archive into a temp directory on an ephemeral CI runner.

**Exposure & mitigation:**
- The archives extracted are the project's **own** backups (bare git mirrors,
  which do not contain symlinks). The risk is a *maliciously crafted* archive in
  the storage bucket.
- v5 adds **signed manifests** (`BACKUP_SIGNING_KEY` / `BACKUP_SIGNING_PUBLIC_KEY`)
  and `BACKUP_REQUIRE_SIGNATURE=true`, giving tamper-evidence at the manifest
  level — restore from a session whose manifest fails verification is aborted.
- Restore only from storage you control, and keep restore runners ephemeral.

**Planned remediation:** replace `extract-zip` with a streaming, path-safe
extractor (rejecting `..`, absolute paths, and symlink entries). Deferred here
because the swap requires installing a replacement package and must be validated
against the restore path; it will be done as a focused, tested change.
