// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

const { apiKeyGuard, safeEqual } = require('../src/server/auth');

function mockReq(headers = {}) {
  return { headers, get(name) { return this.headers[name.toLowerCase()]; } };
}
function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('safeEqual', () => {
  test('true for equal, false for different or different-length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('apiKeyGuard', () => {
  test('is a no-op when no key is configured', () => {
    const guard = apiKeyGuard(undefined);
    let called = false;
    const res = mockRes();
    guard(mockReq(), res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  test('allows a request with the correct x-api-key', () => {
    const guard = apiKeyGuard('s3cr3t');
    let called = false;
    const res = mockRes();
    guard(mockReq({ 'x-api-key': 's3cr3t' }), res, () => { called = true; });
    expect(called).toBe(true);
  });

  test('rejects a missing key with 401', () => {
    const guard = apiKeyGuard('s3cr3t');
    let called = false;
    const res = mockRes();
    guard(mockReq(), res, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  test('rejects a wrong key with 401', () => {
    const guard = apiKeyGuard('s3cr3t');
    const res = mockRes();
    guard(mockReq({ 'x-api-key': 'nope' }), res, () => {});
    expect(res.statusCode).toBe(401);
  });
});
