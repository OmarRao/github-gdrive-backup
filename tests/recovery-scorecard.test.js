// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

const { buildScorecard, formatRto } = require('../src/lib/recovery-scorecard');

describe('recovery scorecard', () => {
  test('successful drill → verified badge with RTO + detail fields', () => {
    const start = Date.parse('2026-07-20T00:00:00Z');
    const sc = buildScorecard({ session: 'backup-x', ok: true, startedAt: start, finishedAt: start + 252000, repos: 5, signature: 'valid' });
    expect(sc.status).toBe('verified');
    expect(sc.rto_seconds).toBe(252);
    expect(sc.color).toBe('brightgreen');
    expect(sc.label).toBe('restore verified');
    expect(sc.message).toContain('252s RTO');
    expect(sc.repos).toBe(5);
    expect(sc.signature).toBe('valid');
    expect(sc.schemaVersion).toBe(1); // shields.io endpoint contract
  });

  test('failed drill → red FAILED badge', () => {
    const t = Date.now();
    const sc = buildScorecard({ session: 'backup-y', ok: false, startedAt: t, finishedAt: t + 1000 });
    expect(sc.status).toBe('failed');
    expect(sc.color).toBe('red');
    expect(sc.message).toBe('FAILED');
  });

  test('negative/backwards timing clamps to 0', () => {
    const t = Date.now();
    expect(buildScorecard({ ok: true, startedAt: t, finishedAt: t - 5000 }).rto_seconds).toBe(0);
  });

  test('formatRto renders seconds and minutes', () => {
    expect(formatRto(45)).toBe('45s');
    expect(formatRto(252)).toBe('4m 12s');
    expect(formatRto(0)).toBe('0s');
  });
});
