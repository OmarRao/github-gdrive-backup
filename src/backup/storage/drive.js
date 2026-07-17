// Copyright (c) Omar Rao. All rights reserved.
/**
 * Google Drive storage adapter.
 * Extracted from src/backup/index.js — same interface as s3.js.
 */
const GoogleDriveClient = require('../gdrive');

let _drive = null;

async function _getDrive() {
  if (_drive) return _drive;
  const auth = await GoogleDriveClient.createAuthClient(
    process.env.GOOGLE_CLIENT_SECRET_PATH || './credentials/google-client-secret.json',
    process.env.GOOGLE_TOKEN_PATH         || './credentials/google-token.json'
  );
  _drive = new GoogleDriveClient(auth);
  return _drive;
}

/**
 * Upload a local file to a Drive folder.
 * @param {string} localPath  Absolute path to the file on disk.
 * @param {string} sessionFolder  Drive folder ID (returned by getOrCreateSessionFolder).
 * @param {string} fileName  Name to use in Drive (defaults to basename of localPath).
 */
async function uploadFile(localPath, sessionFolder, fileName) {
  const drive = await _getDrive();
  return drive.uploadFile(localPath, sessionFolder, 'application/zip', fileName);
}

/**
 * Ensure a session sub-folder exists inside the parent Drive folder and return its ID.
 * @param {string} parentFolderId  Root Drive folder ID.
 * @param {string} sessionName     Name for the session folder (e.g. "backup-2026-06-25T02-00-00-000Z").
 * @returns {Promise<string>}  Drive folder ID.
 */
async function getOrCreateSessionFolder(parentFolderId, sessionName) {
  const drive = await _getDrive();
  return drive.ensureFolder(sessionName, parentFolderId);
}

module.exports = { uploadFile, getOrCreateSessionFolder };
