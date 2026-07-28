#!/usr/bin/env node
// Runs configured gates over a repository.
//
// The gates are capabilities; this reads an adopter's configuration and
// applies them. Like the register and the token list, that configuration is
// layer 3 and lives in the adopter's repository, never here. Unconfigured,
// this runs nothing and says so.
//
// Config file shape (see gates.example.json):
//
//   { "forbidden-chars": { "codepoints": ["U+00A0"], "include": ["\\.md$"] } }
//
// A key naming a gate that does not exist is an ERROR, not a warning. A typo
// in a gate name would otherwise leave the adopter believing a rule is
// enforced while nothing runs, which is this engine's own failure mode
// reproduced in its configuration.
//
// Usage: run-gates.mjs [--staged | --all | <file>...] [--config <path>]

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { discoverGateIds, moduleFileFor, GATES_DIR } from '../gates/registry.mjs';
import { parseRegister, resolveRegisterPath } from './registry-check.mjs';

const CWD = process.cwd();

export function resolveConfigPath(argv = [], env = {}) {
  const i = argv.indexOf('--config');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (env.GOVERNANCE_GATES) return env.GOVERNANCE_GATES;
  // Relative to the caller's repository, not to this engine.
  return resolve(CWD, 'governance', 'gates.json');
}

function git(args) {
  return execFileSync('git', args, { cwd: CWD, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The staged change set, with status letters. Some gates ask which paths a
 * change TOUCHES, which is a different question from which files exist, and
 * has no answer outside a diff.
 */
function stagedChanges() {
  return git(['diff', '--cached', '--name-status', '--diff-filter=ACMRD']).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status: status[0], path: paths[paths.length - 1] };
  });
}

function targetPaths(argv) {
  if (argv.includes('--staged')) {
    return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  }
  if (argv.includes('--all')) return git(['ls-files']);

  const named = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config') {
      i += 1;
      continue;
    }
    if (!argv[i].startsWith('--')) named.push(argv[i]);
  }
  return named;
}

/**
 * JSON has no comments, and a gate configuration is exactly the kind of file
 * that needs them: the reason a pattern is banned matters more than the
 * pattern. A key of exactly "//" is treated as a comment and dropped.
 *
 * This is the one key allowed to be ignored, and it is recognised explicitly
 * rather than by prefix, so "//todo" is still an error. Every other unknown
 * key stays loud, because a silently ignored key is a rule the adopter
 * believes is enforced and is not.
 */
export function stripComments(value) {
  if (Array.isArray(value) || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== '//')
      .map(([k, v]) => [k, stripComments(v)]),
  );
}

/**
 * Load and configure the gates named in `config`. Errors rather than skipping
 * on an unknown gate id or bad parameters, so a misconfiguration is loud.
 */
export async function loadGates(rawConfig, known = discoverGateIds(), context = {}, warn = () => {}) {
  const config = stripComments(rawConfig);
  const loaded = [];
  for (const [gateId, params] of Object.entries(config)) {
    if (!known.includes(gateId)) {
      throw new Error(
        `no gate named "${gateId}". Available: ${known.join(', ') || '(none built yet)'}.`,
      );
    }
    // pathToFileURL, not the bare path: on Windows an absolute path like
    // C:\... is rejected by the ESM loader as an unsupported URL scheme.
    const mod = await import(pathToFileURL(join(GATES_DIR, moduleFileFor(gateId))).href);

    // A gate may need data only the caller can supply, such as the ids from a
    // register. Missing data leaves it inert, so it is reported rather than
    // left to pass quietly behind a green tick.
    for (const { name, orParam } of mod.wants ?? []) {
      const fromCaller = context[name] !== undefined;
      const fromConfig = orParam !== undefined && (params ?? {})[orParam] !== undefined;
      if (!fromCaller && !fromConfig) {
        warn(
          `${gateId} needs "${name}" and will do nothing without it` +
            (orParam ? `, or set "${orParam}" in its config.` : '.'),
        );
      }
    }

    loaded.push({ mod, config: mod.configure(params ?? {}, context) });
  }
  return loaded;
}

function readTextFile(path) {
  const abs = isAbsolute(path) ? path : join(CWD, path);
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  const buf = readFileSync(abs);
  // A NUL byte means binary. Scanning it produces noise, not findings.
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

/**
 * `changes` is the staged change set, or null when the caller is looking at a
 * whole tree rather than a diff.
 *
 * A gate whose inputKind is "changes" cannot answer anything without one. It
 * is skipped with a WARNING rather than passing quietly, because a gate that
 * silently contributes nothing still leaves a green tick that reads as
 * protection.
 */
export function evaluateAll(gates, files, changes = null, warn = () => {}) {
  const findings = [];

  for (const { mod, config } of gates) {
    if (mod.inputKind === 'changes') {
      if (changes === null) {
        warn(
          `${mod.id} needs a change set and was NOT run. ` +
            'Use --staged; it has nothing to say about a whole tree.',
        );
        continue;
      }
      findings.push(...mod.evaluate({ changes }, config));
      continue;
    }
    for (const file of files) {
      if (file.text === null) continue;
      findings.push(...mod.evaluate({ text: file.text, path: file.path }, config));
    }
  }
  return findings;
}

async function main() {
  const argv = process.argv.slice(2);
  const configPath = resolveConfigPath(argv, process.env);

  if (!existsSync(configPath)) {
    console.error('gates: no configuration found.');
    console.error(`  looked for: ${configPath}`);
    console.error('');
    console.error('Point at it with --config <path> or $GOVERNANCE_GATES.');
    console.error('Start one from gates.example.json.');
    process.exit(2);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`gates: ${configPath} is not valid JSON.`);
    console.error(`  ${err.message}`);
    process.exit(2);
  }

  // The register has one home, given by --register or $GOVERNANCE_REGISTER.
  // Resolved once here and injected, so no gate config restates the path and
  // no gate needs to read a file. Absent is fine: gates wanting it will say so.
  const registerPath = resolveRegisterPath(argv, process.env);
  const context = existsSync(registerPath)
    ? { ruleIds: parseRegister(readFileSync(registerPath, 'utf8')).rules.map((r) => r.id) }
    : {};

  let gates;
  try {
    gates = await loadGates(config, discoverGateIds(), context, (m) =>
      console.error(`gates: WARNING ${m}`),
    );
  } catch (err) {
    console.error(`gates: ${err.message}`);
    process.exit(2);
  }

  if (gates.length === 0) {
    console.log('gates: nothing configured, so nothing ran.');
    return;
  }

  const staged = argv.includes('--staged');
  const changes = staged ? stagedChanges() : null;
  const paths = targetPaths(argv);

  if (paths.length === 0 && (changes === null || changes.length === 0)) {
    console.log('gates: nothing to check.');
    return;
  }

  const files = paths.map((path) => ({
    path: relative(CWD, isAbsolute(path) ? path : join(CWD, path)).split('\\').join('/'),
    text: readTextFile(path),
  }));

  const findings = evaluateAll(gates, files, changes, (m) => console.error(`gates: WARNING ${m}`));

  if (findings.length > 0) {
    console.error(`gates: ${findings.length} violation(s)`);
    for (const f of findings) {
      const where = `${f.path ?? '(repository)'}${f.line ? `:${f.line}` : ''}`;
      console.error(`  ${where} [${f.gateId}] ${f.message}`);
    }
    process.exit(1);
  }

  const names = gates.map((g) => g.mod.id).join(', ');
  console.log(`gates: ${files.length} file(s) clean (${names}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
