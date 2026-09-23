// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Optional API-key guard for the self-hosted server's /api routes.
 *
 * When DASHBOARD_API_KEY is set, every /api request must present a matching
 * `x-api-key` header (constant-time compared). When it is unset the guard is a
 * no-op — but the server logs a warning, because the /api endpoints can trigger
 * real backup/restore operations and accept tokens.
 */
const crypto = require('crypto');

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Build an Express middleware enforcing the API key.
 * @param {string|undefined} expectedKey  value of DASHBOARD_API_KEY
 * @returns {(req,res,next)=>void}
 */
function apiKeyGuard(expectedKey) {
  if (!expectedKey) {
    return (_req, _res, next) => next(); // disabled — no key configured
  }
  return (req, res, next) => {
    const provided = req.get ? req.get('x-api-key') : (req.headers && req.headers['x-api-key']);
    if (provided && safeEqual(provided, expectedKey)) return next();
    return res.status(401).json({ error: 'Unauthorized: missing or invalid x-api-key' });
  };
}

module.exports = { apiKeyGuard, safeEqual };
