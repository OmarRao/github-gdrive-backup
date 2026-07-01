// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * Unit tests for storage adapters.
 * These tests verify the public interface contract without hitting real cloud APIs.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ── S3 adapter ──────────────────────────────────────────────────────────────

describe('S3 adapter', () => {
  test('exports uploadFile and getOrCreateSessionFolder', () => {
    const adapter = require('../src/backup/storage/s3');
    expect(typeof adapter.uploadFile).toBe('function');
    expect(typeof adapter.getOrCreateSessionFolder).toBe('function');
  });

  test('getOrCreateSessionFolder returns the session name', async () => {
    const { getOrCreateSessionFolder } = require('../src/backup/storage/s3');
    const result = await getOrCreateSessionFolder('ignored-parent', 'backup-2026-06-26');
    expect(result).toBe('backup-2026-06-26');
  });
});

// ── Azure adapter ────────────────────────────────────────────────────────────

describe('Azure adapter', () => {
  test('exports uploadFile and getOrCreateSessionFolder', () => {
    const adapter = require('../src/backup/storage/azure');
    expect(typeof adapter.uploadFile).toBe('function');
    expect(typeof adapter.getOrCreateSessionFolder).toBe('function');
  });

  test('getOrCreateSessionFolder returns the session name', async () => {
    const { getOrCreateSessionFolder } = require('../src/backup/storage/azure');
    const result = await getOrCreateSessionFolder('ignored-parent', 'backup-2026-06-26');
    expect(result).toBe('backup-2026-06-26');
  });
});

// ── B2 adapter ───────────────────────────────────────────────────────────────

describe('B2 adapter', () => {
  test('exports uploadFile and getOrCreateSessionFolder', () => {
    const adapter = require('../src/backup/storage/b2');
    expect(typeof adapter.uploadFile).toBe('function');
    expect(typeof adapter.getOrCreateSessionFolder).toBe('function');
  });

  test('getOrCreateSessionFolder returns the session name', async () => {
    const { getOrCreateSessionFolder } = require('../src/backup/storage/b2');
    const result = await getOrCreateSessionFolder('ignored-parent', 'backup-2026-06-26');
    expect(result).toBe('backup-2026-06-26');
  });
});
