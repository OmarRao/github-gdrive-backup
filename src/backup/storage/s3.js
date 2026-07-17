// Copyright (c) Omar Rao. All rights reserved.
/**
 * AWS S3 storage adapter (stub).
 * Same interface as drive.js.
 *
 * Required env vars:
 *   AWS_BUCKET_NAME
 *   AWS_REGION
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 */
const fs = require('fs');
const path = require('path');

let _s3Client = null;
let _S3;
let _PutObjectCommand;

function _getClient() {
  if (_s3Client) return _s3Client;
  // Lazy-require so the module loads without crashing when AWS SDK is absent
  // and STORAGE_TARGET !== 's3'.
  ({ S3Client: _S3, PutObjectCommand: _PutObjectCommand } =
    require('@aws-sdk/client-s3'));

  _s3Client = new _S3({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return _s3Client;
}

/**
 * Upload a local file to S3.
 * The S3 key is "{sessionFolder}/{fileName}".
 *
 * @param {string} localPath     Absolute path to the file on disk.
 * @param {string} sessionFolder "Folder" prefix in S3 (the session name string).
 * @param {string} [fileName]    S3 object name (defaults to basename of localPath).
 */
async function uploadFile(localPath, sessionFolder, fileName) {
  const client = _getClient();
  const key    = `${sessionFolder}/${fileName || path.basename(localPath)}`;
  const body   = fs.createReadStream(localPath);
  const size   = fs.statSync(localPath).size;

  await client.send(new _PutObjectCommand({
    Bucket:        process.env.AWS_BUCKET_NAME,
    Key:           key,
    Body:          body,
    ContentLength: size,
    ...wormParams(),
  }));

  // Return an object shaped like a Drive file response so callers can read .size
  return { key, size: String(size) };
}

/**
 * Optional WORM (write-once-read-many) object-lock parameters. Set
 * S3_OBJECT_LOCK_DAYS>0 (bucket must have Object Lock enabled). Mode defaults
 * to GOVERNANCE; set S3_OBJECT_LOCK_MODE=COMPLIANCE for un-bypassable locks.
 * Makes backups ransomware-proof — they cannot be deleted or overwritten until
 * the retention date passes.
 */
function wormParams() {
  const days = parseInt(process.env.S3_OBJECT_LOCK_DAYS || '0', 10);
  if (!days || days <= 0) return {};
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return {
    ObjectLockMode: (process.env.S3_OBJECT_LOCK_MODE || 'GOVERNANCE').toUpperCase(),
    ObjectLockRetainUntilDate: until,
  };
}

/**
 * In S3 there are no real folders — just return the session name as the "folder".
 *
 * @param {string} _parentId   Ignored (no parent concept in S3).
 * @param {string} sessionName Session name used as the key prefix.
 * @returns {Promise<string>}  The sessionName itself.
 */
async function getOrCreateSessionFolder(_parentId, sessionName) {
  return sessionName;
}

module.exports = { uploadFile, getOrCreateSessionFolder };
