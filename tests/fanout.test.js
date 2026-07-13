// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * Unit tests for the multi-destination fan-out module (3-2-1 mirroring).
 * Storage adapters are mocked so no cloud SDK or credentials are required.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Mock the three storage adapters before requiring fanout.
jest.mock('../src/backup/storage/s3', () => ({
  getOrCreateSessionFolder: jest.fn(async (_p, name) => name),
  uploadFile: jest.fn(async (localPath, folder, fileName) => ({ key: `${folder}/${fileName}`, size: String(require('fs').statSync(localPath).size) })),
}));
jest.mock('../src/backup/storage/b2', () => ({
  getOrCreateSessionFolder: jest.fn(async (_p, name) => name),
  // Simulate a corrupt/truncated upload to exercise size verification.
  uploadFile: jest.fn(async (localPath, folder, fileName) => ({ key: `${folder}/${fileName}`, size: '1' })),
}));

const s3 = require('../src/backup/storage/s3');
const fanout = require('../src/backup/storage/fanout');

afterEach(() => { delete process.env.BACKUP_MIRROR_TARGETS; jest.clearAllMocks(); });

describe('fan-out target parsing', () => {
  test('enabled() is false with no targets', () => {
    expect(fanout.enabled()).toBe(false);
    expect(fanout.parseTargets()).toEqual([]);
  });

  test('parseTargets ignores unknown/whitespace and lowercases', () => {
    process.env.BACKUP_MIRROR_TARGETS = ' S3 , bogus, b2 ';
    expect(fanout.parseTargets()).toEqual(['s3', 'b2']);
    expect(fanout.enabled()).toBe(true);
  });
});

describe('session folder init', () => {
  test('resolves a folder per target', async () => {
    process.env.BACKUP_MIRROR_TARGETS = 's3';
    const folders = await fanout.initSessionFolders('backup-2026-07-08');
    expect(folders).toEqual({ s3: 'backup-2026-07-08' });
    expect(s3.getOrCreateSessionFolder).toHaveBeenCalledWith(null, 'backup-2026-07-08');
  });
});

describe('mirrorFile', () => {
  test('reports ok when size matches expected', async () => {
    process.env.BACKUP_MIRROR_TARGETS = 's3';
    const tmp = path.join(os.tmpdir(), `fo-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello world');
    const size = fs.statSync(tmp).size;
    const res = await fanout.mirrorFile(tmp, { s3: 'sess' }, 'file.txt', size);
    fs.rmSync(tmp, { force: true });
    expect(res).toEqual([{ target: 's3', ok: true, size }]);
  });

  test('flags size mismatch as not ok', async () => {
    process.env.BACKUP_MIRROR_TARGETS = 'b2';
    const tmp = path.join(os.tmpdir(), `fo-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello world');
    const res = await fanout.mirrorFile(tmp, { b2: 'sess' }, 'file.txt', 999);
    fs.rmSync(tmp, { force: true });
    expect(res[0].ok).toBe(false);
    expect(res[0].target).toBe('b2');
  });

  test('mirrors to every configured target', async () => {
    process.env.BACKUP_MIRROR_TARGETS = 's3,b2';
    const tmp = path.join(os.tmpdir(), `fo-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'data');
    const res = await fanout.mirrorFile(tmp, { s3: 'sess', b2: 'sess' }, 'file.txt');
    fs.rmSync(tmp, { force: true });
    expect(res.map(r => r.target).sort()).toEqual(['b2', 's3']);
  });
});

describe('mirrorJson', () => {
  test('returns empty array when disabled and leaves no temp files', async () => {
    const res = await fanout.mirrorJson(os.tmpdir(), 'x.json', { a: 1 }, {});
    expect(res).toEqual([]);
  });

  test('writes, mirrors, and cleans up the temp file', async () => {
    process.env.BACKUP_MIRROR_TARGETS = 's3';
    const before = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('mirror-')).length;
    const res = await fanout.mirrorJson(os.tmpdir(), 'summary.json', { ok: true }, { s3: 'sess' });
    const after = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('mirror-')).length;
    expect(res[0].target).toBe('s3');
    expect(after).toBe(before); // temp file removed
  });
});
