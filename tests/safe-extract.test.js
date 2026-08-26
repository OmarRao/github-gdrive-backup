// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

/**
 * Tests for path-safe zip extraction (replacement for the vulnerable
 * extract-zip). Covers the pure path guard, a real extraction round-trip, and
 * rejection of a path-traversal ("zip slip") entry.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const { extractZipSafe, isSafeEntryPath, isSymlinkEntry } = require('../src/lib/safe-extract');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sx-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function makeZip(outPath, entries) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    const zip = archiver('zip');
    out.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(out);
    for (const [name, content] of entries) zip.append(content, { name });
    zip.finalize();
  });
}

describe('isSafeEntryPath', () => {
  const root = path.resolve('/tmp/dest');
  test('allows normal nested paths', () => {
    expect(isSafeEntryPath('repo/file.txt', root)).toBe(true);
    expect(isSafeEntryPath('a/b/c.js', root)).toBe(true);
  });
  test('rejects parent traversal', () => {
    expect(isSafeEntryPath('../evil.txt', root)).toBe(false);
    expect(isSafeEntryPath('a/../../evil', root)).toBe(false);
  });
  test('rejects absolute and drive/UNC paths', () => {
    expect(isSafeEntryPath('/etc/passwd', root)).toBe(false);
    expect(isSafeEntryPath('C:/Windows/x', root)).toBe(false);
    expect(isSafeEntryPath('\\\\server\\share', root)).toBe(false);
  });
  test('rejects empty/invalid', () => {
    expect(isSafeEntryPath('', root)).toBe(false);
    expect(isSafeEntryPath(null, root)).toBe(false);
  });
});

describe('isSymlinkEntry', () => {
  test('detects symlink mode bits in external attrs', () => {
    expect(isSymlinkEntry({ attr: 0o120777 << 16 })).toBe(true);
    expect(isSymlinkEntry({ attr: 0o100644 << 16 })).toBe(false); // regular file
    expect(isSymlinkEntry({})).toBe(false);
  });
});

describe('extractZipSafe', () => {
  test('extracts a normal archive faithfully', async () => {
    const zipPath = path.join(dir, 'ok.zip');
    await makeZip(zipPath, [['a.txt', 'hello'], ['sub/b.txt', 'world']]);
    const dest = path.join(dir, 'out');
    const res = await extractZipSafe(zipPath, dest);
    expect(res.extracted).toBe(2);
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello');
    expect(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8')).toBe('world');
  });

  test('refuses a path-traversal (zip-slip) entry and does not write outside dest', async () => {
    // archiver sanitizes "../" out of names, so craft a genuine traversal entry
    // by byte-patching a fixed-length placeholder name to an equal-length one.
    const placeholder = 'PLACEHOLDER_NAME';       // 16 chars
    const evil = '../evil_escaped.';              // 16 chars (same length)
    const zipPath = path.join(dir, 'evil.zip');
    await makeZip(zipPath, [[placeholder, 'pwned']]);
    const buf = fs.readFileSync(zipPath);
    let idx; // replace every occurrence (local header + central directory)
    while ((idx = buf.indexOf(placeholder)) !== -1) buf.write(evil, idx, 'ascii');
    fs.writeFileSync(zipPath, buf);

    const dest = path.join(dir, 'nested', 'out2');
    // Rejected either by our path guard or by node-stream-zip's own check.
    await expect(extractZipSafe(zipPath, dest)).rejects.toThrow(/unsafe|malicious/i);
    // The traversal target must NOT have been written outside dest.
    expect(fs.existsSync(path.join(dir, 'nested', 'evil_escaped.'))).toBe(false);
  });
});
