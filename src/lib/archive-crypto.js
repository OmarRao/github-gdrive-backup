// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Streaming archive crypto/hash helpers.
 *
 * Backup archives can be multiple gigabytes, so hashing and encryption stream
 * the file in fixed-size chunks (constant memory).
 *
 * Encryption uses **AES-256-GCM** (authenticated): a tampered ciphertext fails
 * to decrypt, so integrity is guaranteed by the cipher itself — not only by the
 * separate manifest hash/signature. New format on disk:
 *
 *     "GCM1"(4) | IV(12) | ciphertext… | authTag(16)
 *
 * The 16-byte GCM tag is appended last so encryption stays single-pass/streaming;
 * decryption reads it from the end via random access. Files written by earlier
 * versions used unauthenticated AES-256-CBC (`IV(16) | ciphertext`); decrypt
 * auto-detects and still reads them for backward compatibility.
 */
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const GCM_MAGIC = Buffer.from('GCM1');   // 4-byte format marker
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const CBC_IV_LEN = 16;                    // legacy

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

/** AES-256-GCM encrypt a file, streaming. Writes MAGIC | IV | ciphertext | tag. */
function encryptFile(inputPath, outputPath, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(inputPath);
    const out = fs.createWriteStream(outputPath);
    rs.on('error', reject);
    cipher.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    out.write(GCM_MAGIC);
    out.write(iv);
    cipher.on('data', d => out.write(d));
    cipher.on('end', () => { out.write(cipher.getAuthTag()); out.end(); });
    rs.pipe(cipher);
  });
}

/**
 * Decrypt a file produced by encryptFile (AES-256-GCM), or a legacy
 * AES-256-CBC file, auto-detected by the 4-byte magic prefix. GCM decryption
 * throws if the ciphertext or tag has been tampered with.
 */
async function decryptFile(inputPath, outputPath, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const fd = await fs.promises.open(inputPath, 'r');
  try {
    const { size } = await fd.stat();
    const magic = Buffer.alloc(GCM_MAGIC.length);
    await fd.read(magic, 0, magic.length, 0);

    if (magic.equals(GCM_MAGIC)) {
      const iv = Buffer.alloc(GCM_IV_LEN);
      await fd.read(iv, 0, GCM_IV_LEN, GCM_MAGIC.length);
      const tag = Buffer.alloc(GCM_TAG_LEN);
      await fd.read(tag, 0, GCM_TAG_LEN, size - GCM_TAG_LEN);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const start = GCM_MAGIC.length + GCM_IV_LEN;       // 16
      const end = size - GCM_TAG_LEN - 1;                // inclusive
      await pipeline(
        fs.createReadStream(inputPath, { start, end }),
        decipher,
        fs.createWriteStream(outputPath),
      );
      return;
    }

    // Legacy AES-256-CBC: IV(16) | ciphertext
    const iv = Buffer.alloc(CBC_IV_LEN);
    await fd.read(iv, 0, CBC_IV_LEN, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    await pipeline(
      fs.createReadStream(inputPath, { start: CBC_IV_LEN }),
      decipher,
      fs.createWriteStream(outputPath),
    );
  } finally {
    await fd.close();
  }
}

module.exports = { sha256File, encryptFile, decryptFile };
