#!/usr/bin/env node
// Asserts that the rules doing the judging did not come from the change being
// judged.
//
// This is the load-bearing property of the whole model. If a branch can supply
// the rules that judge it, the check is decorative: weakening a rule and
// breaking it arrive in the same pull request and pass together, and the green
// tick now certifies nothing.
//
// A document cannot make that true, so this checks it. The commit the rules
// were read from must not be a commit under review.
//
// It fails closed. Invoked with nothing to compare against, it exits 2 rather
// than passing, because a check that cannot answer its question must not look
// like one that answered "fine".
//
// Usage: rules-independence-check.mjs --rules <dir> --not <commit> [--not <commit>...]

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Git's own abbreviation floor. Below it a prefix comparison starts matching
// unrelated commits, which would fail a run for no reason.
const MIN_ABBREV = 7;

// The next flag is not this flag's value. A workflow expression that resolves
// to nothing collapses its argument, so `--not '' --rules dir` would otherwise
// read "--rules" as the commit to compare and never match anything: a silent
// pass of the case this exists to catch.
const value = (argv, i) => (argv[i] && !argv[i].startsWith('--') ? argv[i] : undefined);

export function collect(argv, flag) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && value(argv, i + 1)) values.push(argv[i + 1]);
  }
  return values;
}

export function one(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : value(argv, i + 1);
}

/**
 * Whether two commit ids name the same commit. Either side may be abbreviated,
 * because a workflow expression and a `git rev-parse` do not always agree on
 * length, and a length mismatch reading as "different commits" would be a
 * silent pass of exactly the case this exists to catch.
 */
export function sameCommit(a, b) {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  const shorter = x.length <= y.length ? x : y;
  if (shorter.length < MIN_ABBREV) return false;
  return x.startsWith(shorter) && y.startsWith(shorter);
}

/**
 * The decision, kept pure so the property can be proven without a repository.
 * Returns null when the rules are independent.
 */
export function verdict(rulesSha, forbidden) {
  const hit = forbidden.find((sha) => sameCommit(rulesSha, sha));
  if (!hit) return null;
  return (
    'the rules were read from the commit under review. A change can therefore ' +
    'weaken the rule that judges it, in the same change, and pass. Point the ' +
    'rules at a ratified ref instead.'
  );
}

function headOf(dir) {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function main() {
  const argv = process.argv.slice(2);
  const rulesDir = one(argv, '--rules');
  const forbidden = collect(argv, '--not').filter(Boolean);

  if (!rulesDir) {
    console.error('rules-independence: --rules <dir> is required.');
    process.exit(2);
  }
  if (forbidden.length === 0) {
    console.error('rules-independence: no --not <commit> given, so nothing was compared.');
    console.error('  Pass the commit under review. Exiting 2 rather than passing on nothing.');
    process.exit(2);
  }

  let rulesSha;
  try {
    rulesSha = headOf(rulesDir);
  } catch (err) {
    console.error(`rules-independence: could not read a commit from "${rulesDir}".`);
    console.error(`  ${err.message.split('\n')[0]}`);
    process.exit(2);
  }

  const problem = verdict(rulesSha, forbidden);
  if (problem) {
    console.error(`rules-independence: ${problem}`);
    console.error(`  rules and subject are both at ${rulesSha}`);
    process.exit(1);
  }

  console.log(`rules-independence: rules at ${rulesSha}, independent of the change under review.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
