// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

/**
 * Tests for Ed25519 manifest signing — sign/verify round-trip, tamper and
 * wrong-key rejection, and stable public-key fingerprints.
 */

const signing = require('../src/lib/manifest-signing');

describe('manifest signing (ed25519)', () => {
  let keys;
  beforeAll(() => { keys = signing.generateKeyPair(); });

  test('generateKeyPair returns PEM private + public keys', () => {
    expect(keys.privateKey).toMatch(/BEGIN PRIVATE KEY/);
    expect(keys.publicKey).toMatch(/BEGIN PUBLIC KEY/);
  });

  test('a valid signature verifies', () => {
    const data = JSON.stringify({ session: 'backup-x', repos: [{ repo: 'a', sha256: 'deadbeef' }] });
    const sig = signing.sign(data, keys.privateKey);
    expect(signing.verify(data, sig, keys.publicKey)).toBe(true);
  });

  test('tampered data fails verification', () => {
    const data = 'original manifest bytes';
    const sig = signing.sign(data, keys.privateKey);
    expect(signing.verify('tampered manifest bytes', sig, keys.publicKey)).toBe(false);
  });

  test('wrong public key fails verification', () => {
    const other = signing.generateKeyPair();
    const data = 'manifest';
    const sig = signing.sign(data, keys.privateKey);
    expect(signing.verify(data, sig, other.publicKey)).toBe(false);
  });

  test('garbage signature is rejected, not thrown', () => {
    expect(signing.verify('data', 'not-a-real-signature', keys.publicKey)).toBe(false);
  });

  test('fingerprint is stable and 16 hex chars', () => {
    const fp1 = signing.fingerprint(keys.publicKey);
    const fp2 = signing.fingerprint(keys.publicKey);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
    expect(signing.fingerprint(signing.generateKeyPair().publicKey)).not.toBe(fp1);
  });

  test('Buffer input signs and verifies (matches file-bytes usage)', () => {
    const buf = Buffer.from('binary\x00manifest\xff', 'binary');
    const sig = signing.sign(buf, keys.privateKey);
    expect(signing.verify(buf, sig, keys.publicKey)).toBe(true);
  });
});
