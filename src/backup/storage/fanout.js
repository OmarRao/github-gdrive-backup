// Copyright (c) Omar Rao. All rights reserved.
/**
 * Multi-destination fan-out (3-2-1 backup rule).
 *
 * Google Drive is always the primary destination. This module mirrors every
 * uploaded artifact to zero or more *secondary* destinations so a single
 * provider outage or account compromise never leaves you without a copy.
 *
 * Enable by listing adapters in BACKUP_MIRROR_TARGETS (comma-separated):
 *   BACKUP_MIRROR_TARGETS=s3,b2
 *
 * Each adapter (s3 | azure | b2) reads its own credentials from env — see the
 * respective adapter file. Mirroring is best-effort: a mirror failure is logged
 * and recorded in the summary but never fails the primary backup.
 */
const fs   = require('fs');
const logger = require('../../logger');

const ADAPTERS = { s3: './s3', azure: './azure', b2: './b2' };

/** Parse and validate the configured mirror targets. */
function parseTargets() {
  return (process.env.BACKUP_MIRROR_TARGETS || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => ADAPTERS[t]);
}

/** True when at least one valid mirror target is configured. */
function enabled() {
  return parseTargets().length > 0;
}

function _load(name) {
  return require(ADAPTERS[name]);
}

/**
 * Resolve the session "folder" (key prefix) for each mirror target once,
 * up front, so per-file uploads reuse it.
 * @returns {Promise<Object<string,string>>} map of target -> sessionFolder
 */
async function initSessionFolders(sessionName) {
  const map = {};
  for (const t of parseTargets()) {
    try {
      map[t] = await _load(t).getOrCreateSessionFolder(null, sessionName);
    } catch (e) {
      logger.error(`Mirror init failed for ${t}: ${e.message}`);
      map[t] = sessionName;
    }
  }
  return map;
}

/**
 * Mirror one local file to every configured target.
 * Verifies the reported byte size against expectedSize when provided.
 *
 * @param {string} localPath       File on disk (must still exist).
 * @param {Object} sessionFolders  Map from initSessionFolders().
 * @param {string} fileName        Object name at the destination.
 * @param {number} [expectedSize]  Bytes to verify against; omit to skip.
 * @returns {Promise<Array<{target,ok,size?,error?}>>}
 */
async function mirrorFile(localPath, sessionFolders, fileName, expectedSize) {
  const results = [];
  for (const t of parseTargets()) {
    try {
      const folder = (sessionFolders && sessionFolders[t]) || '';
      const res = await _load(t).uploadFile(localPath, folder, fileName);
      const size = parseInt(res.size, 10);
      const ok = !expectedSize || size === expectedSize;
      if (!ok) {
        logger.error(`Mirror size mismatch on ${t} for ${fileName}: expected ${expectedSize}, got ${size}`);
      } else {
        logger.info(`Mirrored ${fileName} → ${t} (${size} bytes)`);
      }
      results.push({ target: t, ok, size });
    } catch (e) {
      logger.error(`Mirror to ${t} failed for ${fileName}: ${e.message}`);
      results.push({ target: t, ok: false, error: e.message });
    }
  }
  return results;
}

/**
 * Convenience helper: mirror a JSON object by writing a temp file first.
 * @param {string} tmpDir     Directory for the scratch file.
 * @param {string} fileName   Object name (also the temp basename).
 * @param {Object} obj        JSON-serializable payload.
 * @param {Object} sessionFolders
 */
async function mirrorJson(tmpDir, fileName, obj, sessionFolders) {
  if (!enabled()) return [];
  const tmp = require('path').join(tmpDir, `mirror-${Date.now()}-${fileName}`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  try {
    return await mirrorFile(tmp, sessionFolders, fileName);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { enabled, parseTargets, initSessionFolders, mirrorFile, mirrorJson };
