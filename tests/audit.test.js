// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const audit = require('../src/audit/log');

describe('audit JSONL', () => {
  test('buildEntry stamps ts + event and merges fields', () => {
    const e = audit.buildEntry('restore', { conclusion: 'success', repos: 3 });
    expect(e.event).toBe('restore');
    expect(e.conclusion).toBe('success');
    expect(e.repos).toBe(3);
    expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('formatLine produces exactly one line', () => {
    const line = audit.formatLine(audit.buildEntry('x', { note: 'a\nb' }));
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().split('\n')).toHaveLength(1);
  });

  test('append then parse round-trips entries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
    const file = path.join(dir, 'nested', 'audit.jsonl');
    audit.append(file, 'backup', { ok: 1 });
    audit.append(file, 'restore', { ok: 2 });
    const entries = audit.parse(fs.readFileSync(file, 'utf8'));
    fs.rmSync(dir, { recursive: true, force: true });
    expect(entries).toHaveLength(2);
    expect(entries[0].event).toBe('backup');
    expect(entries[1].ok).toBe(2);
  });

  test('parse skips malformed lines', () => {
    const entries = audit.parse('{"event":"a"}\nNOT JSON\n{"event":"b"}');
    expect(entries.map(e => e.event)).toEqual(['a', 'b']);
  });
});

describe('audit hash chain (tamper-evidence)', () => {
  test('appended entries form a valid chain', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-chain-'));
    const file = path.join(dir, 'audit.jsonl');
    audit.append(file, 'backup', { ok: 1 });
    audit.append(file, 'restore', { ok: 2 });
    audit.append(file, 'cleanup', { deleted: 3 });
    const text = fs.readFileSync(file, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    const entries = audit.parse(text);
    expect(entries[0].prev).toBe(audit.GENESIS);
    expect(entries[1].prev).toBe(entries[0].hash);
    expect(audit.verifyChain(entries)).toEqual({ ok: true, brokenAt: null });
  });

  test('editing a past entry breaks the chain', () => {
    const a = audit.buildEntry('backup', { ok: 1 });
    const b = audit.buildEntry('restore', { ok: 2 }, a.hash);
    const tampered = { ...a, ok: 999 }; // edit content, keep old hash
    expect(audit.verifyChain([tampered, b])).toMatchObject({ ok: false, brokenAt: 0, reason: 'hash-mismatch' });
  });

  test('deleting an entry breaks the chain', () => {
    const a = audit.buildEntry('backup', { ok: 1 });
    const b = audit.buildEntry('restore', { ok: 2 }, a.hash);
    const c = audit.buildEntry('cleanup', { ok: 3 }, b.hash);
    // Remove the middle entry — c.prev no longer matches a.hash.
    expect(audit.verifyChain([a, c])).toMatchObject({ ok: false, brokenAt: 1, reason: 'prev-mismatch' });
  });
});
