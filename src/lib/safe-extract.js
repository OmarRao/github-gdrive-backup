// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Path-safe ZIP extraction.
 *
 * Replaces `extract-zip` (GHSA-jmr9-qjv8-65gv: unvalidated symlink path
 * traversal, no fix available). Uses `node-stream-zip` and refuses to write any
 * entry that would escape the destination directory — absolute paths, `..`
 * traversal, or symlink entries are rejected outright. This is safe even for a
 * maliciously crafted archive.
 */
const fs = require('fs');
const path = require('path');
const StreamZip = require('node-stream-zip');

// Unix mode bits: file-type mask and the symlink type.
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/**
 * Is `entryName` safe to extract under `destRoot`?
 * Rejects absolute paths and any path that resolves outside destRoot.
 * Pure (no I/O) → unit-testable.
 */
function isSafeEntryPath(entryName, destRoot) {
  if (!entryName || typeof entryName !== 'string') return false;
  // Normalize separators; reject drive letters / UNC / leading slash.
  const norm = entryName.replace(/\\/g, '/');
  if (path.isAbsolute(norm) || /^[A-Za-z]:/.test(norm) || norm.startsWith('/')) return false;
  const target = path.resolve(destRoot, norm);
  const root = path.resolve(destRoot);
  // target must be root itself or strictly within root/
  return target === root || target.startsWith(root + path.sep);
}

/** True if a zip entry's external attributes mark it a symlink. */
function isSymlinkEntry(entry) {
  // node-stream-zip exposes unix mode in the high 16 bits of externalAttributes.
  const mode = (entry.attr || 0) >>> 16;
  return (mode & S_IFMT) === S_IFLNK;
}

/**
 * Extract a zip to destDir, skipping/failing on unsafe entries.
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {Promise<{extracted:number, skipped:string[]}>}
 */
async function extractZipSafe(zipPath, destDir) {
  const zip = new StreamZip.async({ file: zipPath });
  const skipped = [];
  let extracted = 0;
  try {
    const entries = await zip.entries();
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of Object.values(entries)) {
      if (isSymlinkEntry(entry)) { skipped.push(entry.name + ' (symlink)'); continue; }
      if (!isSafeEntryPath(entry.name, destDir)) { skipped.push(entry.name + ' (unsafe path)'); continue; }
      const outPath = path.join(destDir, entry.name.replace(/\\/g, '/'));
      if (entry.isDirectory) { fs.mkdirSync(outPath, { recursive: true }); continue; }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await zip.extract(entry.name, outPath);
      extracted++;
    }
    if (skipped.length) {
      throw new Error(`Refused ${skipped.length} unsafe zip entr${skipped.length === 1 ? 'y' : 'ies'}: ${skipped.slice(0, 5).join(', ')}`);
    }
    return { extracted, skipped };
  } finally {
    await zip.close();
  }
}

module.exports = { extractZipSafe, isSafeEntryPath, isSymlinkEntry };
