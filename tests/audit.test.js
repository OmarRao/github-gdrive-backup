// Copyright (c) Omar Rao. All rights reserved.
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
