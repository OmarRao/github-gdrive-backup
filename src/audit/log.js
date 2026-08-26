// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
/**
 * Structured, tamper-evident JSON-lines audit log.
 *
 * Each entry is one JSON object per line (append-only-cheap, SIEM-ingestible).
 * Entries are hash-chained: every entry carries `prev`, the SHA-256 of the
 * previous entry's canonical bytes. Deleting or editing any past entry breaks
 * the chain, which `verifyChain` detects — so the log cannot be silently
 * rewritten after the fact.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENESIS = '0'.repeat(64);

/** SHA-256 (hex) of an entry's canonical JSON (excludes the `hash` field). */
function hashEntry(entry) {
  const { hash, ...rest } = entry; // eslint-disable-line no-unused-vars
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

/**
 * Build a single audit entry, chained to the previous entry's hash.
 * @param {string} event
 * @param {object} fields
 * @param {string} prevHash  hash of the previous entry (GENESIS for the first)
 */
function buildEntry(event, fields = {}, prevHash = GENESIS) {
  const base = { ts: new Date().toISOString(), event, ...fields, prev: prevHash };
  return { ...base, hash: hashEntry(base) };
}

/** Serialize an entry to a single JSONL line (no embedded newlines). */
function formatLine(entry) {
  return JSON.stringify(entry).replace(/\n/g, ' ') + '\n';
}

/** Parse a JSONL audit file into entries (skips malformed lines). */
function parse(text) {
  return (text || '').split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

/** Hash of the last entry in a file (GENESIS if none/unreadable). */
function lastHash(file) {
  try {
    const entries = parse(fs.readFileSync(file, 'utf8'));
    if (!entries.length) return GENESIS;
    return entries[entries.length - 1].hash || hashEntry(entries[entries.length - 1]);
  } catch {
    return GENESIS;
  }
}

/** Append an event, chaining it to the current tail of the file. */
function append(file, event, fields = {}) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const entry = buildEntry(event, fields, lastHash(file));
  fs.appendFileSync(file, formatLine(entry));
  return entry;
}

/**
 * Verify the hash chain of a parsed/serialized log.
 * @returns {{ok:boolean, brokenAt:number|null, reason?:string}}
 */
function verifyChain(textOrEntries) {
  const entries = Array.isArray(textOrEntries) ? textOrEntries : parse(textOrEntries);
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prev !== prev) return { ok: false, brokenAt: i, reason: 'prev-mismatch' };
    if (e.hash !== hashEntry(e)) return { ok: false, brokenAt: i, reason: 'hash-mismatch' };
    prev = e.hash;
  }
  return { ok: true, brokenAt: null };
}

module.exports = { GENESIS, buildEntry, hashEntry, formatLine, parse, lastHash, append, verifyChain };
