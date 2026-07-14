// Copyright (c) Omar Rao. All rights reserved.
/**
 * True delta (incremental) backup via git bundles.
 *
 * Instead of uploading a full mirror archive every session, we upload a
 * `git bundle` containing *only the objects new since the last backup*. This
 * cuts storage and upload bandwidth dramatically for repos that change little
 * between runs, while remaining fully restorable:
 *
 *   session 0 → full.bundle        (base — all objects)
 *   session 1 → delta.bundle       (objects not in session 0)
 *   session 2 → delta.bundle       (objects not in session 1)
 *
 * Restore clones the base bundle, then fetches each delta bundle in order.
 *
 * The clone *from GitHub* is still a full mirror (required to compute a correct
 * delta locally); the saving is on the storage/upload side, which is the cost
 * that actually accrues over time on Drive/S3/B2.
 */
const { execSync } = require('child_process');

/** Read the current ref → SHA map from a mirror clone. Empty repo → {}. */
function readRefs(mirrorDir) {
  let out = '';
  try {
    out = execSync('git show-ref', { cwd: mirrorDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return {}; // `git show-ref` exits non-zero when there are no refs
  }
  const map = {};
  out.split('\n').filter(Boolean).forEach(line => {
    const idx = line.indexOf(' ');
    if (idx > 0) map[line.slice(idx + 1)] = line.slice(0, idx);
  });
  return map;
}

/** Order-independent equality of two ref → SHA maps. */
function refsEqual(a = {}, b = {}) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

/**
 * Decide how to back up this repo given the previous ref state.
 * @returns {'full'|'delta'|'unchanged'}
 */
function decideMode(prevRefs, curRefs) {
  if (!prevRefs || Object.keys(prevRefs).length === 0) return 'full';
  if (refsEqual(prevRefs, curRefs)) return 'unchanged';
  return 'delta';
}

/** Keep only SHAs that actually exist as objects in the mirror. */
function existingShas(mirrorDir, shas) {
  return [...new Set(shas)].filter(sha => {
    try {
      execSync(`git cat-file -e "${sha}^{commit}"`, { cwd: mirrorDir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Create a bundle. `full` bundles every object; `delta` excludes objects
 * reachable from the previous refs. Returns the chosen mode (may downgrade a
 * `delta` to `full` if none of the previous SHAs are still present, e.g. after
 * a history rewrite / force-push).
 *
 * @param {string} mirrorDir  Path to the mirror clone.
 * @param {string} outFile    Bundle output path.
 * @param {Object} prevRefs   Previous ref → SHA map.
 * @param {string} mode       'full' | 'delta'
 * @returns {string} effective mode actually written
 */
function createBundle(mirrorDir, outFile, prevRefs, mode) {
  if (mode === 'delta') {
    const prevShas = existingShas(mirrorDir, Object.values(prevRefs || {}));
    if (prevShas.length) {
      execSync(`git bundle create "${outFile}" --all --not ${prevShas.join(' ')}`, { cwd: mirrorDir, stdio: 'ignore' });
      return 'delta';
    }
    // No usable base objects remain — fall back to a full bundle.
    mode = 'full';
  }
  execSync(`git bundle create "${outFile}" --all`, { cwd: mirrorDir, stdio: 'ignore' });
  return 'full';
}

/**
 * Reconstruct a repository from a base bundle plus ordered delta bundles.
 * Produces a mirror repo at destDir.
 *
 * @param {string} baseBundle    Path to the base (full) bundle.
 * @param {string[]} deltaBundles Ordered delta bundle paths (oldest first).
 * @param {string} destDir       Output mirror repo directory.
 */
function reconstruct(baseBundle, deltaBundles, destDir) {
  execSync(`git clone --mirror "${baseBundle}" "${destDir}"`, { stdio: 'ignore' });
  for (const delta of deltaBundles || []) {
    execSync(`git fetch "${delta}" "refs/*:refs/*"`, { cwd: destDir, stdio: 'ignore' });
  }
  return destDir;
}

module.exports = { readRefs, refsEqual, decideMode, existingShas, createBundle, reconstruct };
