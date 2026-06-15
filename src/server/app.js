require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('../logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/api'));

// Serve the SPA for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  logger.info(`GitHub → Google Drive Backup UI running at http://localhost:${PORT}`);
});

module.exports = app;
