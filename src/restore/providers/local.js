// Copyright (c) Omar Rao. All rights reserved.
/**
 * Local restore "provider" — reconstructs repositories to a directory on disk
 * instead of pushing to a remote. Ideal for disaster-recovery drills, offline
 * inspection, or migrating into a system this tool doesn't natively target.
 *
 * Output goes to RESTORE_LOCAL_DIR (or options.localDest), one bare mirror repo
 * per backup: <dest>/<repo>.git
 */
const path = require('path');

function create(options = {}) {
  const dest = options.localDest || process.env.RESTORE_LOCAL_DIR || './restore-output';
  return {
    id: 'local',
    localDest: path.resolve(dest),
    // No remote operations in local mode — these are intentional no-ops.
    async ensureRepo() {},
    remoteUrl() { return null; },
    async restoreLabels() {},
    async restoreMilestones() {},
  };
}

module.exports = { create };
