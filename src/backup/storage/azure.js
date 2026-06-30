/**
 * Azure Blob Storage adapter.
 * Same interface as s3.js and drive.js.
 *
 * Required env vars:
 *   AZURE_STORAGE_CONNECTION_STRING
 *   AZURE_CONTAINER_NAME
 */
const fs   = require('fs');
const path = require('path');

let _client = null;

function _getClient() {
  if (_client) return _client;
  const { BlobServiceClient } = require('@azure/storage-blob');
  _client = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  return _client;
}

/**
 * Upload a local file to Azure Blob Storage.
 *
 * @param {string} localPath     Absolute path to the file on disk.
 * @param {string} sessionFolder Container "virtual folder" prefix.
 * @param {string} [fileName]    Blob name (defaults to basename of localPath).
 * @returns {Promise<{key: string, size: string}>}
 */
async function uploadFile(localPath, sessionFolder, fileName) {
  const client        = _getClient();
  const containerName = process.env.AZURE_CONTAINER_NAME || 'gh-backups';
  const blobName      = `${sessionFolder}/${fileName || path.basename(localPath)}`;
  const containerClient = client.getContainerClient(containerName);

  // Create container if it doesn't exist
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const size = fs.statSync(localPath).size;

  await blockBlobClient.uploadFile(localPath, {
    blockSize: 4 * 1024 * 1024,
    concurrency: 5,
  });

  return { key: blobName, size: String(size) };
}

/**
 * Azure Blob uses flat namespace — return the session folder prefix.
 *
 * @param {string} _parentId   Ignored.
 * @param {string} sessionName Session name used as blob prefix.
 * @returns {Promise<string>}
 */
async function getOrCreateSessionFolder(_parentId, sessionName) {
  return sessionName;
}

module.exports = { uploadFile, getOrCreateSessionFolder };
