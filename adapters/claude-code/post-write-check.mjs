#!/usr/bin/env node
// Claude Code adapter for layer 1. A PostToolUse hook on Write/Edit that runs
// the neutrality gate on the file just written, so a slip surfaces immediately
// rather than at commit time.
//
// This is a SHIM. All it does is turn Claude Code's hook payload into a file
// path, call the assistant-agnostic gate in scripts/, and translate the exit
// code back. The contract, and what an adapter for a different assistant must
// do, is in ../README.md.
//
// It earns its place because an assistant generating most of a repository is
// the highest-volume author in it, and a violation caught here costs one edit
// instead of a rewritten history. It is still the weakest stage: it sees only
// this assistant's own writes.
//
// Install: see README.md in this directory.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let input = '';
for await (const chunk of process.stdin) input += chunk;

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!filePath) process.exit(0);

const result = spawnSync(
  process.execPath,
  [join(REPO_ROOT, 'scripts', 'neutrality-check.mjs'), filePath],
  { encoding: 'utf8' },
);

// Exit 2 means no token list is configured, which is a valid state for anyone
// holding no adopter data. Surfacing it here would be noise on every write;
// the commit and push hooks already warn once per commit.
if (result.status === 2) process.exit(0);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
if (result.status !== 0 || output.length > 0) {
  // Exit 2 from a Claude Code hook surfaces the finding to the model so it can
  // correct the file before moving on.
  console.error(output || 'neutrality gate failed');
  process.exit(2);
}
