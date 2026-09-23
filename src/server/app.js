// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('../logger');
const { apiKeyGuard } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to localhost by default; set HOST=0.0.0.0 only behind a trusted proxy.
const HOST = process.env.HOST || '127.0.0.1';

// Security headers, including an enforced Content-Security-Policy that mirrors
// the origins the dashboard SPA needs (Google auth/APIs, GitHub API). helmet
// also sets HSTS, noSniff, frameguard, referrer-policy, etc.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://accounts.google.com', 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://*.googleapis.com', 'https://accounts.google.com', 'https://apis.google.com', 'https://www.gstatic.com', 'https://*.google.com'],
      frameSrc: ['https://accounts.google.com', 'https://*.google.com', 'https://*.firebaseapp.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate-limit the API surface (it can trigger real backup/restore operations).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

// Optional API-key auth on /api (enabled when DASHBOARD_API_KEY is set).
if (!process.env.DASHBOARD_API_KEY) {
  logger.warn('DASHBOARD_API_KEY not set — /api is unauthenticated. Set it, or run only on localhost / behind an authenticating proxy.');
}
app.use('/api', apiLimiter, apiKeyGuard(process.env.DASHBOARD_API_KEY), require('./routes/api'));

// Serve the SPA for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* istanbul ignore next */
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    logger.info(`GitHub → Google Drive Backup UI running at http://${HOST}:${PORT}`);
  });
}

module.exports = app;
