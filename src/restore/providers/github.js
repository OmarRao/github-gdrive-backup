// Copyright (c) Omar Rao. All rights reserved.
/**
 * GitHub restore-destination provider.
 * Wraps the original (default) restore behavior behind the common provider
 * interface so restore can target GitHub, GitLab, or Gitea interchangeably.
 */
const { Octokit } = require('@octokit/rest');
const logger = require('../../logger');

function create(options = {}) {
  const token = options.token || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for the GitHub restore provider.');
  const octokit = new Octokit({ auth: token });

  return {
    id: 'github',

    async ensureRepo(owner, repo, opts = {}) {
      try {
        await octokit.repos.get({ owner, repo });
        logger.info(`Repo ${owner}/${repo} already exists — pushing to it`);
      } catch {
        await octokit.repos.createForAuthenticatedUser({
          name: repo,
          private: opts.private !== false,
          description: `Restored from backup on ${new Date().toISOString()}`,
        });
        logger.info(`Created GitHub repo ${owner}/${repo}`);
      }
    },

    remoteUrl(owner, repo) {
      return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    },

    async restoreLabels(owner, repo, labels = []) {
      for (const label of labels) {
        await octokit.issues.createLabel({
          owner, repo,
          name: label.name, color: label.color, description: label.description || '',
        }).catch(() => {});
      }
    },

    async restoreMilestones(owner, repo, milestones = []) {
      for (const ms of milestones) {
        await octokit.issues.createMilestone({
          owner, repo,
          title: ms.title, description: ms.description, due_on: ms.due_on,
        }).catch(() => {});
      }
    },
  };
}

module.exports = { create };
