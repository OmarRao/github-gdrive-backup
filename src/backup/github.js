// Copyright (c) Omar Rao. All rights reserved.
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

class GitHubClient {
  constructor(token) {
    this.token = token;
    this.octokit = new Octokit({ auth: token });
  }

  async listRepos(owner) {
    const repos = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.repos.listForUser({
        username: owner,
        per_page: 100,
        page,
        type: 'all',
      }).catch(() =>
        this.octokit.repos.listForOrg({ org: owner, per_page: 100, page, type: 'all' })
      );
      if (!data.length) break;
      repos.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return repos;
  }

  async cloneRepo(repo, destDir) {
    const cloneUrl = repo.clone_url.replace(
      'https://',
      `https://x-access-token:${this.token}@`
    );
    const repoDir = path.join(destDir, 'git');
    fs.mkdirSync(repoDir, { recursive: true });
    await simpleGit().clone(cloneUrl, repoDir, ['--mirror']);
    logger.info(`Cloned ${repo.full_name}`);
    return repoDir;
  }

  async fetchIssues(owner, repo) {
    const issues = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.issues.listForRepo({
        owner, repo, state: 'all', per_page: 100, page,
      });
      if (!data.length) break;
      issues.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return issues;
  }

  async fetchPullRequests(owner, repo) {
    const prs = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.pulls.list({
        owner, repo, state: 'all', per_page: 100, page,
      });
      if (!data.length) break;
      prs.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return prs;
  }

  async fetchReleases(owner, repo) {
    const releases = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.repos.listReleases({
        owner, repo, per_page: 100, page,
      });
      if (!data.length) break;
      releases.push(...data);
      if (data.length < 100) break;
      page++;
    }
    return releases;
  }

  async fetchLabels(owner, repo) {
    const { data } = await this.octokit.issues.listLabelsForRepo({ owner, repo, per_page: 100 });
    return data;
  }

  async fetchMilestones(owner, repo) {
    const { data } = await this.octokit.issues.listMilestones({ owner, repo, state: 'all', per_page: 100 });
    return data;
  }

  /**
   * Capture repository configuration for config-level disaster recovery:
   * settings, branch protection, collaborators, webhook shapes, and the NAMES
   * of Actions secrets (values are never retrievable via the API and are never
   * stored). Every call is best-effort — missing scopes simply omit that slice.
   */
  async fetchRepoConfig(owner, repo) {
    const config = {};
    let defaultBranch = 'main';
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      defaultBranch = data.default_branch || 'main';
      config.settings = {
        default_branch: data.default_branch,
        visibility: data.visibility,
        description: data.description,
        homepage: data.homepage,
        topics: data.topics,
        has_issues: data.has_issues,
        has_wiki: data.has_wiki,
        has_projects: data.has_projects,
        allow_squash_merge: data.allow_squash_merge,
        allow_merge_commit: data.allow_merge_commit,
        allow_rebase_merge: data.allow_rebase_merge,
        delete_branch_on_merge: data.delete_branch_on_merge,
        archived: data.archived,
      };
    } catch { /* insufficient scope */ }
    try {
      const { data } = await this.octokit.repos.getBranchProtection({ owner, repo, branch: defaultBranch });
      config.branch_protection = { branch: defaultBranch, rules: data };
    } catch { /* no protection or no admin scope */ }
    try {
      const { data } = await this.octokit.repos.listCollaborators({ owner, repo, per_page: 100 });
      config.collaborators = data.map(c => ({ login: c.login, role_name: c.role_name, permissions: c.permissions }));
    } catch { /* no push access */ }
    try {
      const { data } = await this.octokit.actions.listRepoSecrets({ owner, repo, per_page: 100 });
      config.secret_names = (data.secrets || []).map(s => s.name); // names only — never values
    } catch { /* no admin scope */ }
    try {
      const { data } = await this.octokit.repos.listWebhooks({ owner, repo, per_page: 100 });
      config.webhooks = data.map(w => ({ events: w.events, active: w.active, url: w.config && w.config.url }));
    } catch { /* no admin scope */ }
    return config;
  }

  async fetchWiki(owner, repo, destDir) {
    try {
      const wikiUrl = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.wiki.git`;
      const wikiDir = path.join(destDir, 'wiki');
      fs.mkdirSync(wikiDir, { recursive: true });
      await simpleGit().clone(wikiUrl, wikiDir, ['--mirror']);
      return wikiDir;
    } catch {
      // Wiki may not exist
      return null;
    }
  }
}

module.exports = GitHubClient;
