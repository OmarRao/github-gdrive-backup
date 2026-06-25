#!/usr/bin/env node
/**
 * gh-gdrive-backup CLI
 *
 * Usage:
 *   gh-gdrive-backup backup   – run a full backup
 *   gh-gdrive-backup restore  – run a restore
 *   gh-gdrive-backup cleanup  – run cleanup of old sessions
 */

const { spawn } = require('child_process');
const path = require('path');

const [,, command, ...args] = process.argv;

const COMMANDS = {
  backup:  path.join(__dirname, 'backup', 'index.js'),
  restore: path.join(__dirname, 'restore', 'index.js'),
  cleanup: path.join(__dirname, 'cleanup', 'index.js'),
};

function usage() {
  console.error(`Usage: gh-gdrive-backup <command> [args]

Commands:
  backup    Run a full GitHub → Drive backup
  restore   Restore from a Drive backup session
  cleanup   Delete Drive sessions older than RETENTION_DAYS

Environment variables are read from .env (via dotenv) or the shell.
`);
  process.exit(1);
}

if (!command || !COMMANDS[command]) {
  usage();
}

const child = spawn(process.execPath, [COMMANDS[command], ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => { console.error(err.message); process.exit(1); });
