// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

/**
 * Tests for the streaming archive crypto/hash helpers. These assert the
 * streamed implementations are byte-for-byte compatible with the previous
 * in-memory ones (same SHA-256, same AES-256-CBC `IV||ciphertext` format,
 * lossless encrypt→decrypt round-trip) — i.e. no behavior change, just memory.
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
    const data = crypto.randomBytes(1024 * 64 + 7); // odd size, multiple chunks
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

describe('encrypt/decrypt streaming', () => {
  test('round-trips content losslessly', async () => {
    const src = path.join(dir, 'plain.bin');
    const enc = path.join(dir, 'plain.bin.enc');
    const dec = path.join(dir, 'plain.out');
    const data = crypto.randomBytes(1024 * 128 + 13);
    fs.writeFileSync(src, data);

    await encryptFile(src, enc, KEY);
    await decryptFile(enc, dec, KEY);

    expect(fs.readFileSync(dec).equals(data)).toBe(true);
  });

  test('on-disk format is 16-byte IV followed by ciphertext (decryptable by the legacy in-memory path)', async () => {
    const src = path.join(dir, 'p2.bin');
    const enc = path.join(dir, 'p2.enc');
    const data = Buffer.from('hello world '.repeat(1000));
    fs.writeFileSync(src, data);
    await encryptFile(src, enc, KEY);

    const encBytes = fs.readFileSync(enc);
    const iv = encBytes.subarray(0, 16);
    const ciphertext = encBytes.subarray(16);
    // Decrypt using the previous (buffer-based) approach to prove compatibility.
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(KEY, 'hex'), iv);
    const out = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    expect(out.equals(data)).toBe(true);
  });

  test('ciphertext produced by the legacy path decrypts via the streaming path', async () => {
    const data = Buffer.from('compatibility check '.repeat(500));
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
