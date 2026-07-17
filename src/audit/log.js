// Copyright (c) Omar Rao. All rights reserved.
/**
 * Structured JSON-lines audit log. Each entry is one JSON object per line so the
 * log is both append-only-cheap and machine-parseable (filterable in the UI,
 * ingestible by a SIEM). Replaces the previous free-text `docs/audit.log`.
 */
const fs = require('fs');
const path = require('path');

/** Build a single audit entry object (pure — easy to test). */
function buildEntry(event, fields = {}) {
  return { ts: new Date().toISOString(), event, ...fields };
}

/** Serialize an entry to a single JSONL line (no embedded newlines). */
function formatLine(entry) {
  return JSON.stringify(entry).replace(/\n/g, ' ') + '\n';
}

/** Append an event to a JSONL audit file, creating parent dirs as needed. */
function append(file, event, fields = {}) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.appendFileSync(file, formatLine(buildEntry(event, fields)));
}

/** Parse a JSONL audit file into an array of entries (skips malformed lines). */
function parse(text) {
  return (text || '').split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

module.exports = { buildEntry, formatLine, append, parse };
