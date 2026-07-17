// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * Unit tests for the cross-provider restore-destination factory and the
 * pure (non-network) parts of each provider: id, selection, and remote-URL
 * construction with credential embedding.
 */

const { getProvider, resolveProviderId, PROVIDERS } = require('../src/restore/providers');

const ENV_KEYS = ['RESTORE_TARGET_PROVIDER', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'GITLAB_HOST', 'GITEA_TOKEN', 'GITEA_HOST'];
const saved = {};
beforeEach(() => { ENV_KEYS.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; }); });
afterEach(() => { ENV_KEYS.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

describe('provider selection', () => {
  test('defaults to github', () => {
    expect(resolveProviderId()).toBe('github');
  });

  test('honors RESTORE_TARGET_PROVIDER (case/space insensitive)', () => {
    process.env.RESTORE_TARGET_PROVIDER = '  GitLab ';
    expect(resolveProviderId()).toBe('gitlab');
  });

  test('options.provider overrides env', () => {
    process.env.RESTORE_TARGET_PROVIDER = 'gitlab';
    expect(resolveProviderId({ provider: 'gitea' })).toBe('gitea');
  });

  test('rejects unknown providers', () => {
    expect(() => resolveProviderId({ provider: 'bitbucket' })).toThrow(/Unknown restore provider/);
  });

  test('exposes github, gitlab, gitea, local', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['gitea', 'github', 'gitlab', 'local']);
  });
});

describe('local provider', () => {
  test('needs no credentials and resolves a destination', () => {
    const p = getProvider({ provider: 'local', localDest: './out' });
    expect(p.id).toBe('local');
    expect(p.localDest).toMatch(/out$/);
    expect(p.remoteUrl('a', 'b')).toBeNull();
  });
  test('ensureRepo/label/milestone are no-ops', async () => {
    const p = getProvider({ provider: 'local' });
    await expect(p.ensureRepo('a', 'b')).resolves.toBeUndefined();
    await expect(p.restoreLabels('a', 'b', [{ name: 'x' }])).resolves.toBeUndefined();
  });
});

describe('credential requirements', () => {
  test('github requires a token', () => {
    expect(() => getProvider({ provider: 'github' })).toThrow(/GITHUB_TOKEN/);
  });
  test('gitlab requires a token', () => {
    expect(() => getProvider({ provider: 'gitlab' })).toThrow(/GITLAB_TOKEN/);
  });
  test('gitea requires token and host', () => {
    expect(() => getProvider({ provider: 'gitea', token: 't' })).toThrow(/GITEA_HOST/);
  });
});

describe('remote URL construction', () => {
  test('github embeds x-access-token', () => {
    const p = getProvider({ provider: 'github', token: 'ghp_abc' });
    expect(p.id).toBe('github');
    expect(p.remoteUrl('acme', 'repo')).toBe('https://x-access-token:ghp_abc@github.com/acme/repo.git');
  });

  test('gitlab embeds oauth2 and honors custom host', () => {
    const p = getProvider({ provider: 'gitlab', token: 'glpat', host: 'https://git.acme.io/' });
    expect(p.remoteUrl('team', 'svc')).toBe('https://oauth2:glpat@git.acme.io/team/svc.git');
  });

  test('gitlab defaults to gitlab.com', () => {
    const p = getProvider({ provider: 'gitlab', token: 'glpat' });
    expect(p.remoteUrl('team', 'svc')).toBe('https://oauth2:glpat@gitlab.com/team/svc.git');
  });

  test('gitea embeds token and uses configured host', () => {
    const p = getProvider({ provider: 'gitea', token: 'gto', host: 'https://gitea.acme.io' });
    expect(p.remoteUrl('org', 'proj')).toBe('https://gto@gitea.acme.io/org/proj.git');
  });
});
