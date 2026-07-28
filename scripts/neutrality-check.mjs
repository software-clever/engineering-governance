#!/usr/bin/env node
// Neutrality gate. Fails if adopter-identifying content reaches this repo.
//
// This repo holds mechanism only (layers 1 and 2). Rule records, gate
// parameters and anything naming the adopting business live outside it
// (layer 3). That boundary is the whole portability claim, so it is a gate
// rather than a promise.
//
// The banned-token list is NEVER inside this repository, not even ignored. A
// file of real names sitting in the working tree is one `git add -f` or one
// lost ignore rule away from a permanent public commit, and defending a hazard
// with an ignore rule is weaker than removing the hazard. The list is resolved
// from outside the tree; `neutrality.tokens.example` is the tracked template,
// and it names nothing.
//
// Resolution order:
//   1. --tokens <path>
//   2. $GOVERNANCE_TOKENS
//   3. ~/.config/engineering-governance/tokens
//
// Invoked directly with no resolvable list, it FAILS CLOSED (exit 2). If you
// ask it to run, it runs or it errors. Callers that must stay usable without a
// list (the git hooks) treat exit 2 as "not configured" and say so loudly;
// see .githooks/. You can only leak identifiers you hold, so a contributor
// with no list has nothing to leak and must not be blocked.
//
// Usage: neutrality-check.mjs [--staged | --all | --history | <file>...]
//                             [--tokens <path>]

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TOKENS = join(homedir(), '.config', 'engineering-governance', 'tokens');

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|md|json|ya?ml|html|css|sql|sh|txt|example)$/;
// The template names nothing, but it explains the format using placeholder
// tokens; scanning it would be noise either way.
const SKIP = /(^|\/)(node_modules|dist|coverage)\/|(^|\/)neutrality\.tokens\.example$/;

// A copyright notice must name its holder, so the holder's name is legitimate
// wherever such a notice appears. This is the one unavoidable exemption, and
// it is scoped to the notice line itself rather than to a whole file, so the
// rest of LICENSE is still scanned. It reveals who owns the code, never what
// they enforce.
//
// The year is required by the pattern, so an ordinary sentence beginning with
// the word "copyright" cannot be used as an escape hatch.
const COPYRIGHT_NOTICE =
  /^\s*(?:\/\/|#|\*|--|<!--)?\s*(?:copyright|\(c\)|©)\s*(?:\(c\)|©)?\s*\d{4}/i;

// Fold case and punctuation into word runs.
//
// camelCase and PascalCase boundaries are split BEFORE lowercasing, so an
// identifier like `exampleCorpClient` yields the words that let a token match.
// Without the split it folds to one unbroken word and the token hides inside
// it, which is how an adopter name most often reaches source code.
export function normalise(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The comparison form: normalised, then spaces removed. Both the tokens and
// the text windows are reduced to this, so ONE token covers every punctuation
// and spacing variant of itself. "ExampleCorp", "Example Corp",
// "example-corp.com" and "jane@examplecorp.co.uk" all canonicalise to
// "examplecorp". Without this the adopter has to remember every spelling, and
// a gate that forgetting can defeat is not a gate.
export function canon(text) {
  return normalise(text).replace(/ /g, '');
}

// A one-word token can appear in text split across several words, so the
// scanner needs windows wider than any token's own word count. Four covers the
// spellings seen in practice (hyphenated names, dotted domains, split
// identifiers) and the scan is O(maxWords x words), so widening it is cheap.
const MIN_WINDOW_WORDS = 4;

// Every 1..maxWords word window of the line, in canonical form, so a token is
// caught without the caller knowing where the boundaries fall.
export function windows(line, maxWords) {
  const words = normalise(line).split(' ').filter(Boolean);
  const out = new Set();
  for (let n = 1; n <= maxWords; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      out.add(words.slice(i, i + n).join(''));
    }
  }
  return out;
}

export function isCopyrightNotice(line) {
  return COPYRIGHT_NOTICE.test(line);
}

export function loadTokens(raw) {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  // maxWords is derived from the list, not configured. One less knob to get
  // wrong, and it cannot drift out of step with the tokens themselves.
  const maxWords = lines.reduce(
    (m, t) => Math.max(m, normalise(t).split(' ').filter(Boolean).length),
    MIN_WINDOW_WORDS,
  );
  const set = new Set(lines.map(canon).filter(Boolean));
  return { set, maxWords };
}

export function resolveTokensPath(argv = [], env = {}) {
  const i = argv.indexOf('--tokens');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (env.GOVERNANCE_TOKENS) return env.GOVERNANCE_TOKENS;
  return DEFAULT_TOKENS;
}

function git(args, maxBuffer = 64 * 1024 * 1024) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer });
}

function gitList(args) {
  return git(args)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Walk a unified diff, yielding added lines with file and line attribution.
// Shared by --staged and --history so the two cannot drift apart.
function addedLines(diff, label = null) {
  const out = [];
  let file = null;
  let lineNo = 0;
  let commit = label;
  for (const line of diff.split('\n')) {
    const marker = /^commit ([0-9a-f]{7,40})$/.exec(line);
    if (marker) {
      commit = marker[1].slice(0, 9);
      continue;
    }
    const fileMatch = /^\+\+\+ b\/(.*)$/.exec(line);
    if (fileMatch) {
      file = fileMatch[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (file && !SKIP.test(file)) {
        out.push({ file, line: lineNo, text: line.slice(1), commit });
      }
      lineNo += 1;
    }
  }
  return out;
}

// --staged reads added lines only, so a pre-existing violation elsewhere in a
// file does not block an unrelated commit.
function stagedAdditions() {
  return addedLines(git(['diff', '--cached', '--no-color', '-U0', '--diff-filter=ACMR']));
}

// --history answers "did anything ever leak?" definitively, rather than only
// checking the current tree. History is permanent: a name removed in a later
// commit is still in the repository forever, so the working tree being clean
// proves nothing. Commit MESSAGES are scanned too, for the same reason.
function historyLines() {
  const patch = git([
    'log',
    '--all',
    '--no-color',
    '--no-merges',
    '-p',
    '-U0',
    '--format=commit %H',
  ]);
  const out = addedLines(patch);

  const messages = git(['log', '--all', '--no-merges', '--format=%H%x00%B%x00']);
  for (const entry of messages.split('\0\n')) {
    const [sha, body] = entry.split('\0');
    if (!sha || !body) continue;
    body.split('\n').forEach((text, i) => {
      out.push({ file: `(commit message ${sha.trim().slice(0, 9)})`, line: i + 1, text });
    });
  }
  return out;
}

// Callers pass either repo-relative paths (git plumbing) or absolute ones
// (assistant hooks hand over an absolute file_path). Joining an absolute path
// onto the repo root yields a path that does not exist, so the file would be
// skipped and the gate would report clean: a silent pass in the layer meant to
// catch the highest-volume author. Resolve both shapes explicitly.
export function resolveTarget(file) {
  const abs = isAbsolute(file) ? file : join(REPO_ROOT, file);
  const rel = relative(REPO_ROOT, abs).split('\\').join('/');
  return { abs, label: rel && !rel.startsWith('..') ? rel : file };
}

function fileLines(files) {
  const out = [];
  for (const file of files) {
    const { abs, label } = resolveTarget(file);
    if (SKIP.test(label) || !TEXT_EXT.test(label)) continue;
    if (!existsSync(abs)) continue;
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => out.push({ file: label, line: i + 1, text: line }));
  }
  return out;
}

function targets(argv) {
  if (argv.includes('--staged')) return stagedAdditions();
  if (argv.includes('--history')) return historyLines();
  if (argv.includes('--all')) return fileLines(gitList(['ls-files']));

  const named = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tokens') {
      i += 1;
      continue;
    }
    if (!argv[i].startsWith('--')) named.push(argv[i]);
  }
  if (named.length === 0) {
    console.error('usage: neutrality-check.mjs [--staged | --all | --history | <file>...]');
    console.error('                            [--tokens <path>]');
    process.exit(2);
  }
  // A named file that does not exist is a caller mistake, usually a mangled
  // path. Skipping it would report clean without having read anything, which
  // is the failure mode this gate least tolerates.
  for (const file of named) {
    if (!existsSync(resolveTarget(file).abs)) {
      console.error(`neutrality: cannot read ${file}`);
      console.error('  A named file must exist. Refusing to report clean on an unread file.');
      process.exit(2);
    }
  }
  return fileLines(named);
}

function main() {
  const argv = process.argv.slice(2);
  const tokensPath = resolveTokensPath(argv, process.env);

  if (!existsSync(tokensPath)) {
    console.error('neutrality: no token list, so the gate cannot run.');
    console.error(`  looked for: ${tokensPath}`);
    console.error('');
    console.error('The list is deliberately kept outside this repository. Create it with');
    console.error('  sh scripts/setup.sh');
    console.error('or point at an existing one with --tokens <path> or $GOVERNANCE_TOKENS.');
    process.exit(2);
  }

  const { set: banned, maxWords } = loadTokens(readFileSync(tokensPath, 'utf8'));
  if (banned.size === 0) {
    console.error(`neutrality: ${tokensPath} holds no tokens, so the gate would pass`);
    console.error('anything. Populate it from neutrality.tokens.example.');
    process.exit(2);
  }

  const hits = new Set();
  for (const { file, line, text, commit } of targets(argv)) {
    if (isCopyrightNotice(text)) continue;
    for (const w of windows(text, maxWords)) {
      if (banned.has(w)) {
        // The matched text is deliberately not printed. Echoing it would put
        // the banned identifier into CI logs, which is the leak this prevents.
        hits.add(commit ? `${commit} ${file}:${line}` : `${file}:${line}`);
        break;
      }
    }
  }

  if (hits.size > 0) {
    console.error('neutrality: BLOCKED. Adopter-identifying content found at:');
    for (const h of hits) console.error(`  ${h}`);
    console.error('');
    console.error('This repo holds mechanism only. Anything naming a business, a client, a');
    console.error("person or a product belongs in that adopter's own private repo.");
    console.error('The matched text is not echoed here on purpose.');
    process.exit(1);
  }
}

// Importable for tests; only runs the gate when invoked directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
