// Copyright (c) 2026 Omar Rao
// SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
// This file is available under the GNU Affero General Public License v3.0
// or under a separate commercial license.
'use strict';

/**
 * Unit tests for the logger module.
 */

describe('Logger', () => {
  let logger;

  beforeAll(() => {
    logger = require('../src/logger');
  });

  test('exports a winston logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  test('can log info without throwing', () => {
    expect(() => logger.info('test log message')).not.toThrow();
  });

  test('can log errors without throwing', () => {
    expect(() => logger.error('test error message')).not.toThrow();
  });
});
