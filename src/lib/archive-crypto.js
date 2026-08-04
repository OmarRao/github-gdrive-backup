// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Streaming archive crypto/hash helpers.
 *
 * Backup archives can be multiple gigabytes. The previous implementations read
 * the entire file into memory (and, for encryption, built ~3 full copies via
 * Buffer.concat), which spikes RSS and risks OOM on a standard CI runner. These
 * helpers stream instead — constant memory regardless of archive size — while
 * producing byte-for-byte identical output (same SHA-256, same on-disk
 * `IV || ciphertext` AES-256-CBC format).
 */
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const IV_LEN = 16;

/** SHA-256 of a file, computed by streaming (constant memory). */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', chunk => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * AES-256-CBC encrypt a file, streaming. Output format is unchanged:
 * the random 16-byte IV followed by the ciphertext.
 */
async function encryptFile(inputPath, outputPath, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const out = fs.createWriteStream(outputPath);
  // IV is written first so it precedes the ciphertext, matching the prior format.
  out.write(iv);
  await pipeline(fs.createReadStream(inputPath), cipher, out);
}

/**
 * AES-256-CBC decrypt a file produced by encryptFile, streaming. Reads the
 * 16-byte IV prefix, then streams the remaining ciphertext through the decipher.
 */
async function decryptFile(inputPath, outputPath, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const fd = await fs.promises.open(inputPath, 'r');
  try {
    const iv = Buffer.alloc(IV_LEN);
    await fd.read(iv, 0, IV_LEN, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    await pipeline(
      fs.createReadStream(inputPath, { start: IV_LEN }),
      decipher,
      fs.createWriteStream(outputPath),
    );
  } finally {
    await fd.close();
  }
}

module.exports = { sha256File, encryptFile, decryptFile };
