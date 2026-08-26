// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Cryptographic manifest signing (Ed25519).
 *
 * SHA-256 hashes in the manifest catch *corruption*; they do not prove a backup
 * wasn't *forged* by whoever can write to the storage bucket. Signing the
 * manifest with a private key held only by the backup owner makes tampering
 * detectable: a restore verifies the signature with the corresponding public
 * key before trusting the session.
 *
 * Uses Node's built-in Ed25519 — no external binary, keys are standard PEM.
 */
const crypto = require('crypto');

/** Generate an Ed25519 keypair as PEM strings (helper for setup/tests). */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Sign a string/Buffer with an Ed25519 PEM private key → base64 signature. */
function sign(data, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  // Ed25519 signs the message directly (algorithm arg must be null).
  return crypto.sign(null, Buffer.from(data), key).toString('base64');
}

/** Verify a base64 Ed25519 signature over data with a PEM public key. */
function verify(data, signatureB64, publicKeyPem) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, Buffer.from(data), key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/** Short, human-readable fingerprint of a public key (SHA-256, first 16 hex). */
function fingerprint(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

module.exports = { generateKeyPair, sign, verify, fingerprint };
