// Copyright (c) Omar Rao. All rights reserved.
/**
 * GitLab restore-destination provider (gitlab.com or self-hosted).
 *
 * Env vars:
 *   GITLAB_TOKEN  — personal access token with `api` + `write_repository` scope
 *   GITLAB_HOST   — base URL, default https://gitlab.com
 *
 * Projects are created under the authenticated user's namespace unless the
 * target owner resolves to an existing group the token can write to.
 */
const axios = require('axios');
const logger = require('../../logger');

function create(options = {}) {
  const token = options.token || process.env.GITLAB_TOKEN;
  if (!token) throw new Error('GITLAB_TOKEN is required for the GitLab restore provider.');
  const host = (options.host || process.env.GITLAB_HOST || 'https://gitlab.com').replace(/\/+$/, '');
  const api = `${host}/api/v4`;
  const headers = { 'PRIVATE-TOKEN': token };

  async function findProject(owner, repo) {
    const encoded = encodeURIComponent(`${owner}/${repo}`);
    try {
      const res = await axios.get(`${api}/projects/${encoded}`, { headers });
      return res.data; // { id, ... }
    } catch {
      return null;
    }
  }

  return {
    id: 'gitlab',

    async ensureRepo(owner, repo, opts = {}) {
      const existing = await findProject(owner, repo);
      if (existing) {
        logger.info(`GitLab project ${owner}/${repo} already exists — pushing to it`);
        this._projectId = existing.id;
        return;
      }
      const res = await axios.post(`${api}/projects`, {
        name: repo,
        path: repo,
        visibility: opts.private === false ? 'public' : 'private',
        description: `Restored from backup on ${new Date().toISOString()}`,
      }, { headers });
      this._projectId = res.data.id;
      logger.info(`Created GitLab project ${owner}/${repo}`);
    },

    remoteUrl(owner, repo) {
      const bare = host.replace(/^https?:\/\//, '');
      return `https://oauth2:${token}@${bare}/${owner}/${repo}.git`;
    },

    async restoreLabels(owner, repo, labels = []) {
      const id = this._projectId || (await findProject(owner, repo))?.id;
      if (!id) return;
      for (const label of labels) {
        await axios.post(`${api}/projects/${id}/labels`, {
          name: label.name,
          color: `#${(label.color || '888888').replace(/^#/, '')}`,
          description: label.description || '',
        }, { headers }).catch(() => {});
      }
    },

    async restoreMilestones(owner, repo, milestones = []) {
      const id = this._projectId || (await findProject(owner, repo))?.id;
      if (!id) return;
      for (const ms of milestones) {
        await axios.post(`${api}/projects/${id}/milestones`, {
          title: ms.title,
          description: ms.description || '',
          due_date: ms.due_on ? ms.due_on.slice(0, 10) : undefined,
        }, { headers }).catch(() => {});
      }
    },
  };
}

module.exports = { create };
