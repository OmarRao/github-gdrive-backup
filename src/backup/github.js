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
