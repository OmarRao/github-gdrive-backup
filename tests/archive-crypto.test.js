// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

/**
 * Tests for the streaming archive crypto/hash helpers.
 * - SHA-256 streaming matches the in-memory hash.
 * - AES-256-GCM round-trips losslessly and DETECTS tampering (authenticated).
 * - Legacy AES-256-CBC files still decrypt (backward compatibility).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { sha256File, encryptFile, decryptFile } = require('../src/lib/archive-crypto');

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'; // 32 bytes hex

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('sha256File', () => {
  test('matches crypto.createHash over the same bytes', async () => {
    const f = path.join(dir, 'a.bin');
    const data = crypto.randomBytes(1024 * 64 + 7);
    fs.writeFileSync(f, data);
    const expected = crypto.createHash('sha256').update(data).digest('hex');
    expect(await sha256File(f)).toBe(expected);
  });

  test('empty file hashes to the known SHA-256 of empty input', async () => {
    const f = path.join(dir, 'empty.bin');
    fs.writeFileSync(f, Buffer.alloc(0));
    expect(await sha256File(f)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('AES-256-GCM (authenticated) round-trip', () => {
  test('round-trips content losslessly', async () => {
    const src = path.join(dir, 'plain.bin');
    const enc = path.join(dir, 'plain.enc');
    const dec = path.join(dir, 'plain.out');
    const data = crypto.randomBytes(1024 * 128 + 13);
    fs.writeFileSync(src, data);
    await encryptFile(src, enc, KEY);
    await decryptFile(enc, dec, KEY);
    expect(fs.readFileSync(dec).equals(data)).toBe(true);
  });

  test('writes the GCM1 magic header', async () => {
    const src = path.join(dir, 's.bin'); fs.writeFileSync(src, Buffer.from('hi'));
    const enc = path.join(dir, 's.enc');
    await encryptFile(src, enc, KEY);
    expect(fs.readFileSync(enc).subarray(0, 4).toString()).toBe('GCM1');
  });

  test('tampering with the ciphertext is DETECTED (decrypt throws)', async () => {
    const src = path.join(dir, 't.bin'); fs.writeFileSync(src, crypto.randomBytes(4096));
    const enc = path.join(dir, 't.enc');
    await encryptFile(src, enc, KEY);
    const buf = fs.readFileSync(enc);
    buf[20] = buf[20] ^ 0xff;               // flip a ciphertext byte (after magic+iv)
    fs.writeFileSync(enc, buf);
    await expect(decryptFile(enc, path.join(dir, 't.out'), KEY)).rejects.toThrow();
  });

  test('a wrong key is rejected', async () => {
    const src = path.join(dir, 'w.bin'); fs.writeFileSync(src, crypto.randomBytes(2048));
    const enc = path.join(dir, 'w.enc');
    await encryptFile(src, enc, KEY);
    const wrong = 'ff'.repeat(32);
    await expect(decryptFile(enc, path.join(dir, 'w.out'), wrong)).rejects.toThrow();
  });
});

describe('legacy AES-256-CBC backward compatibility', () => {
  test('decrypts a file written in the old IV||ciphertext CBC format', async () => {
    const data = Buffer.from('legacy backup payload '.repeat(200));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(KEY, 'hex'), iv);
    const legacy = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    const enc = path.join(dir, 'legacy.enc');
    const dec = path.join(dir, 'legacy.out');
    fs.writeFileSync(enc, legacy);
    await decryptFile(enc, dec, KEY);
    expect(fs.readFileSync(dec).equals(data)).toBe(true);
  });
});
