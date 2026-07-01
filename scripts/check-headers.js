#!/usr/bin/env node
// Copyright (c) Omar Rao. All rights reserved.
/**
 * Standalone script to verify copyright headers in all src JS files.
 * Run: node scripts/check-headers.js
 * Exit 0 = all OK, Exit 1 = missing headers.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const REQUIRED = 'Copyright (c) Omar Rao';
let missing = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith('.js')) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (!content.includes(REQUIRED)) {
      console.error(`MISSING: ${path.relative(process.cwd(), full)}`);
      missing++;
    }
  }
}

walk(SRC);

if (missing === 0) {
  console.log(`✓ All source files carry the copyright header.`);
  process.exit(0);
} else {
  console.error(`\n${missing} file(s) missing the copyright header. Add:\n  // Copyright (c) Omar Rao. All rights reserved.`);
  process.exit(1);
}
