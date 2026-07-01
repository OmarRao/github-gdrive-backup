// Copyright (c) Omar Rao. All rights reserved.
'use strict';

/**
 * Enforces that every source file under src/ carries a copyright header.
 * This test fails CI if a new file is added without the required notice.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const REQUIRED = 'Copyright (c) Omar Rao';

function collectJs(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(full, results);
    else if (entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

describe('Copyright headers', () => {
  const files = collectJs(SRC_DIR);

  test('src/ contains at least one JS file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach(file => {
    test(`${path.relative(process.cwd(), file)} has copyright header`, () => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toContain(REQUIRED);
    });
  });
});
