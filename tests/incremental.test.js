// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * End-to-end tests for delta (incremental) backup using REAL local git.
 * Exercises the full lifecycle: full bundle → delta bundle → reconstruct,
 * plus ref-state decisioning and force-push fallback.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const inc = require('../src/backup/incremental');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
};
function git(cmd, cwd) { execSync(`git ${cmd}`, { cwd, env: GIT_ENV, stdio: 'ignore' }); }

let work;
beforeEach(() => { work = fs.mkdtempSync(path.join(os.tmpdir(), 'inc-')); });
afterEach(() => { fs.rmSync(work, { recursive: true, force: true }); });

function makeOrigin() {
  const origin = path.join(work, 'origin');
  fs.mkdirSync(origin);
  git('init -q', origin);
  git('commit -q --allow-empty -m c1', origin);
  git('commit -q --allow-empty -m c2', origin);
  return origin;
}
function mirror(origin, name) {
  const dir = path.join(work, name);
  git(`clone -q --mirror "${origin}" "${dir}"`, work);
  return dir;
}

describe('ref reading & comparison', () => {
  test('readRefs returns a ref→sha map', () => {
    const origin = makeOrigin();
    const m = mirror(origin, 'm1');
    const refs = inc.readRefs(m);
    const keys = Object.keys(refs);
    expect(keys.some(k => k.includes('refs/heads/'))).toBe(true);
    expect(refs[keys[0]]).toMatch(/^[0-9a-f]{40}$/);
  });

  test('refsEqual is order-independent and value-sensitive', () => {
    expect(inc.refsEqual({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
    expect(inc.refsEqual({ a: '1' }, { a: '2' })).toBe(false);
    expect(inc.refsEqual({ a: '1' }, { a: '1', b: '2' })).toBe(false);
  });
});

describe('decideMode', () => {
  test('full when no prior state', () => {
    expect(inc.decideMode(null, { a: '1' })).toBe('full');
    expect(inc.decideMode({}, { a: '1' })).toBe('full');
  });
  test('unchanged when refs identical', () => {
    expect(inc.decideMode({ a: '1' }, { a: '1' })).toBe('unchanged');
  });
  test('delta when refs differ', () => {
    expect(inc.decideMode({ a: '1' }, { a: '2' })).toBe('delta');
  });
});

describe('full + delta bundle lifecycle', () => {
  test('base full bundle then delta reconstructs complete history', () => {
    const origin = makeOrigin();
    const m1 = mirror(origin, 'm1');
    const prevRefs = inc.readRefs(m1);

    const fullBundle = path.join(work, 'full.bundle');
    expect(inc.createBundle(m1, fullBundle, null, 'full')).toBe('full');
    expect(fs.existsSync(fullBundle)).toBe(true);

    // add two more commits, re-mirror, make a delta
    git('commit -q --allow-empty -m c3', origin);
    git('commit -q --allow-empty -m c4', origin);
    const m2 = mirror(origin, 'm2');
    const curRefs = inc.readRefs(m2);
    expect(inc.decideMode(prevRefs, curRefs)).toBe('delta');

    const deltaBundle = path.join(work, 'delta.bundle');
    expect(inc.createBundle(m2, deltaBundle, prevRefs, 'delta')).toBe('delta');
    // delta should be a proper subset in intent — both files exist
    expect(fs.existsSync(deltaBundle)).toBe(true);

    // reconstruct base + delta → all 4 commits present
    const restored = path.join(work, 'restored.git');
    inc.reconstruct(fullBundle, [deltaBundle], restored);
    const log = execSync('git log --oneline --all', { cwd: restored, env: GIT_ENV }).toString();
    ['c1', 'c2', 'c3', 'c4'].forEach(c => expect(log).toContain(c));
  });

  test('delta falls back to full after history rewrite (missing base objects)', () => {
    const origin = makeOrigin();
    const m1 = mirror(origin, 'm1');
    const prevRefs = inc.readRefs(m1);

    // Fabricate previous SHAs that do not exist in the new mirror.
    const fakeRefs = { 'refs/heads/master': '0'.repeat(40) };
    const m2 = mirror(origin, 'm2');
    const out = path.join(work, 'out.bundle');
    // Prev sha absent → createBundle must downgrade to a full bundle.
    expect(inc.createBundle(m2, out, fakeRefs, 'delta')).toBe('full');
    expect(fs.existsSync(out)).toBe(true);
    void prevRefs;
  });
});
