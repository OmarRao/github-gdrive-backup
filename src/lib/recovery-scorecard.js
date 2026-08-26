// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Recovery scorecard — turns a restore drill into a publishable proof of
 * recoverability: when it last succeeded and how long it took (RTO). Rendered
 * as a README badge and a dashboard tile so "backups exist" becomes "restores
 * are verified".
 */

/**
 * @param {object} o
 * @param {string} o.session        Session name that was drilled.
 * @param {boolean} o.ok            Whether the drill succeeded.
 * @param {number} o.startedAt      epoch ms when the drill started.
 * @param {number} o.finishedAt     epoch ms when it finished.
 * @param {number} [o.repos]        Repos verified.
 * @param {string} [o.signature]    Manifest signature status (valid/unsigned/…).
 * @returns {object} scorecard suitable for JSON + shields.io endpoint badge.
 */
function buildScorecard(o) {
  const rto = Math.max(0, Math.round(((o.finishedAt || 0) - (o.startedAt || 0)) / 1000));
  const status = o.ok ? 'verified' : 'failed';
  return {
    schemaVersion: 1,               // shields.io endpoint badge fields ↓
    label: 'restore verified',
    message: o.ok ? `${rto}s RTO · ${new Date(o.finishedAt).toISOString().slice(0, 10)}` : 'FAILED',
    color: o.ok ? 'brightgreen' : 'red',
    // ↑ badge fields · ↓ detail fields
    status,
    last_verified: new Date(o.finishedAt || Date.now()).toISOString(),
    rto_seconds: rto,
    session: o.session || null,
    repos: (o.repos !== null && o.repos !== undefined) ? o.repos : null,
    signature: o.signature || null,
  };
}

/** Format RTO seconds as a compact human string (e.g. "4m 12s"). */
function formatRto(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

module.exports = { buildScorecard, formatRto };
