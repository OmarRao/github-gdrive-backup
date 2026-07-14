// Copyright (c) Omar Rao. All rights reserved.
/**
 * Gitea restore-destination provider (self-hosted Git).
 *
 * Env vars:
 *   GITEA_TOKEN — access token with repo write scope
 *   GITEA_HOST  — base URL, e.g. https://gitea.example.com
 *
 * Repos are created for the authenticated user (or under an org when the
 * target owner matches an org the token can write to).
 */
const axios = require('axios');
const logger = require('../../logger');

function create(options = {}) {
  const token = options.token || process.env.GITEA_TOKEN;
  if (!token) throw new Error('GITEA_TOKEN is required for the Gitea restore provider.');
  const host = (options.host || process.env.GITEA_HOST || '').replace(/\/+$/, '');
  if (!host) throw new Error('GITEA_HOST is required for the Gitea restore provider.');
  const api = `${host}/api/v1`;
  const headers = { Authorization: `token ${token}` };

  async function repoExists(owner, repo) {
    try {
      await axios.get(`${api}/repos/${owner}/${repo}`, { headers });
      return true;
    } catch {
      return false;
    }
  }

  return {
    id: 'gitea',

    async ensureRepo(owner, repo, opts = {}) {
      if (await repoExists(owner, repo)) {
        logger.info(`Gitea repo ${owner}/${repo} already exists — pushing to it`);
        return;
      }
      // Try org endpoint first; fall back to the authenticated user's namespace.
      const body = {
        name: repo,
        private: opts.private !== false,
        description: `Restored from backup on ${new Date().toISOString()}`,
      };
      try {
        await axios.post(`${api}/orgs/${owner}/repos`, body, { headers });
      } catch {
        await axios.post(`${api}/user/repos`, body, { headers });
      }
      logger.info(`Created Gitea repo ${owner}/${repo}`);
    },

    remoteUrl(owner, repo) {
      const bare = host.replace(/^https?:\/\//, '');
      return `https://${token}@${bare}/${owner}/${repo}.git`;
    },

    async restoreLabels(owner, repo, labels = []) {
      for (const label of labels) {
        await axios.post(`${api}/repos/${owner}/${repo}/labels`, {
          name: label.name,
          color: `#${(label.color || '888888').replace(/^#/, '')}`,
          description: label.description || '',
        }, { headers }).catch(() => {});
      }
    },

    async restoreMilestones(owner, repo, milestones = []) {
      for (const ms of milestones) {
        await axios.post(`${api}/repos/${owner}/${repo}/milestones`, {
          title: ms.title,
          description: ms.description || '',
          due_on: ms.due_on || undefined,
        }, { headers }).catch(() => {});
      }
    },
  };
}

module.exports = { create };
