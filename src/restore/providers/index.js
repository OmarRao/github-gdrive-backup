// Copyright (c) Omar Rao. All rights reserved.
/**
 * Restore-destination provider factory.
 *
 * Cross-provider restore: a backup captured from GitHub (or GitLab) can be
 * restored into GitHub, GitLab, or Gitea. Git history is provider-agnostic —
 * only repo creation, the authenticated remote URL, and label/milestone APIs
 * differ, which each provider module encapsulates.
 *
 * Select with RESTORE_TARGET_PROVIDER (github | gitlab | gitea); default github.
 */
const PROVIDERS = {
  github: () => require('./github'),
  gitlab: () => require('./gitlab'),
  gitea:  () => require('./gitea'),
};

/** Normalize and validate the configured provider id. */
function resolveProviderId(options = {}) {
  const id = (options.provider || process.env.RESTORE_TARGET_PROVIDER || 'github')
    .trim().toLowerCase();
  if (!PROVIDERS[id]) {
    throw new Error(`Unknown restore provider "${id}". Valid values: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  return id;
}

/** Build a provider instance from options/env. */
function getProvider(options = {}) {
  const id = resolveProviderId(options);
  return PROVIDERS[id]().create(options);
}

module.exports = { getProvider, resolveProviderId, PROVIDERS };
