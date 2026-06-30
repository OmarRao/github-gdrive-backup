/**
 * Backblaze B2 storage adapter.
 * B2 is S3-compatible — reuses the AWS SDK with a custom endpoint.
 * Same interface as s3.js and drive.js.
 *
 * Required env vars:
 *   B2_ENDPOINT    (e.g. https://s3.us-west-004.backblazeb2.com)
 *   B2_KEY_ID      (B2 application key ID)
 *   B2_APP_KEY     (B2 application key)
 *   B2_BUCKET      (B2 bucket name)
 */
const fs   = require('fs');
const path = require('path');

let _b2Client = null;
let _S3;
let _PutObjectCommand;

function _getClient() {
  if (_b2Client) return _b2Client;
  ({ S3Client: _S3, PutObjectCommand: _PutObjectCommand } =
    require('@aws-sdk/client-s3'));

  _b2Client = new _S3({
    endpoint: process.env.B2_ENDPOINT,
    region:   'auto',
    credentials: {
      accessKeyId:     process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    },
  });
  return _b2Client;
}

/**
 * Upload a local file to Backblaze B2.
 *
 * @param {string} localPath     Absolute path to the file on disk.
 * @param {string} sessionFolder "Folder" prefix in the bucket.
 * @param {string} [fileName]    Object name (defaults to basename of localPath).
 * @returns {Promise<{key: string, size: string}>}
 */
async function uploadFile(localPath, sessionFolder, fileName) {
  const client = _getClient();
  const key    = `${sessionFolder}/${fileName || path.basename(localPath)}`;
  const body   = fs.createReadStream(localPath);
  const size   = fs.statSync(localPath).size;

  await client.send(new _PutObjectCommand({
    Bucket:        process.env.B2_BUCKET,
    Key:           key,
    Body:          body,
    ContentLength: size,
  }));

  return { key, size: String(size) };
}

/**
 * B2 uses flat namespace — return the session name as the key prefix.
 *
 * @param {string} _parentId   Ignored.
 * @param {string} sessionName Session name used as key prefix.
 * @returns {Promise<string>}
 */
async function getOrCreateSessionFolder(_parentId, sessionName) {
  return sessionName;
}

module.exports = { uploadFile, getOrCreateSessionFolder };
