// Copyright (c) Omar Rao. All rights reserved.
'use strict';

const { renderIssuesHtml } = require('../src/backup/issues-archive');

describe('renderIssuesHtml', () => {
  test('renders issues and PRs with counts', () => {
    const html = renderIssuesHtml({
      repo: 'acme/api',
      backed_up_at: '2026-07-14T00:00:00Z',
      issues: [
        { number: 1, title: 'Bug A', state: 'open', user: { login: 'alice' }, created_at: '2026-01-01T00:00:00Z', labels: [{ name: 'bug' }] },
        { number: 2, title: 'Done B', state: 'closed', user: { login: 'bob' }, created_at: '2026-02-01T00:00:00Z' },
      ],
      pull_requests: [
        { number: 3, title: 'Feature C', state: 'open', user: { login: 'carol' }, created_at: '2026-03-01T00:00:00Z' },
      ],
    });
    expect(html).toContain('acme/api');
    expect(html).toContain('2 issue(s) · 1 pull request(s)');
    expect(html).toContain('Bug A');
    expect(html).toContain('Feature C');
    expect(html).toContain('bug'); // label
  });

  test('escapes HTML in titles to prevent injection', () => {
    const html = renderIssuesHtml({
      repo: 'x', issues: [{ number: 1, title: '<script>alert(1)</script>', state: 'open', user: { login: 'z' } }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('excludes PRs surfaced via the issues API (pull_request marker)', () => {
    const html = renderIssuesHtml({
      repo: 'x',
      issues: [
        { number: 1, title: 'RealIssue', state: 'open', user: { login: 'a' } },
        { number: 2, title: 'IsActuallyPR', state: 'open', user: { login: 'a' }, pull_request: {} },
      ],
    });
    expect(html).toContain('1 issue(s)');
    expect(html).toContain('RealIssue');
    expect(html).not.toContain('IsActuallyPR');
  });

  test('handles empty metadata gracefully', () => {
    const html = renderIssuesHtml({});
    expect(html).toContain('No issues or pull requests captured.');
  });
});
