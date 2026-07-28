// Proof for the neutrality gate. Run: node --test scripts/
//
// The gate is the mechanism the portability claim rests on, so it gets a test
// showing the FAILING case, not only that it stays quiet on clean input. A
// gate only ever observed passing has not been observed at all.
//
// Every token here is a placeholder. This file names no real business.

import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalise,
  canon,
  windows,
  loadTokens,
  isCopyrightNotice,
  resolveTokensPath,
  resolveTarget,
} from './neutrality-check.mjs';

test('normalise folds case and punctuation into word runs', () => {
  assert.equal(normalise('Example-Corp'), 'example corp');
  assert.equal(normalise('hello@examplecorp.co.uk'), 'hello examplecorp co uk');
  assert.equal(normalise('  examplecorp!  '), 'examplecorp');
});

test('normalise splits camel and Pascal boundaries', () => {
  assert.equal(normalise('exampleCorpClient'), 'example corp client');
  assert.equal(normalise('ExampleCorp'), 'example corp');
  assert.equal(normalise('HTTPExampleCorp'), 'http example corp', 'acronym run');
});

test('canon collapses every spelling of a name to one form', () => {
  const forms = ['ExampleCorp', 'Example Corp', 'example-corp', 'EXAMPLE.CORP'];
  for (const f of forms) assert.equal(canon(f), 'examplecorp', f);
});

test('windows yields every 1..maxWords run, canonicalised', () => {
  const w = windows('acme industries ltd', 2);
  assert.ok(w.has('acme'));
  assert.ok(w.has('acmeindustries'), 'adjacent words are joined, not spaced');
  assert.ok(w.has('industriesltd'));
  assert.ok(!w.has('acmeindustriesltd'), 'must not exceed maxWords');
});

test('loadTokens ignores comments and blanks, and derives maxWords', () => {
  const { set, maxWords } = loadTokens('# a comment\n\nexamplecorp\nacme industries ltd\n');
  assert.deepEqual([...set], ['examplecorp', 'acmeindustriesltd']);
  assert.equal(maxWords, 4, 'floored so a one-word token still catches split spellings');

  const wide = loadTokens('a b c d e f\n');
  assert.equal(wide.maxWords, 6, 'and raised by a longer token');
});

// The claim that matters. One token, every spelling.
test('a planted identifier is caught, in any spelling', () => {
  const { set, maxWords } = loadTokens('examplecorp\nacme industries\n');
  const caught = (line) => [...windows(line, maxWords)].some((w) => set.has(w));

  assert.ok(caught('Copyright ExampleCorp Ltd'), 'plain occurrence');
  assert.ok(caught('see https://example-corp.com/docs'), 'hyphenated in a URL');
  assert.ok(caught('contact jane@examplecorp.co.uk'), 'inside an email address');
  assert.ok(caught('# EXAMPLECORP'), 'uppercase in a comment');
  assert.ok(caught('deployed to example_corp_prod'), 'snake case in an identifier');
  assert.ok(caught('const exampleCorpClient = ...'), 'camel case splits on the boundary');
  assert.ok(caught('a client called Acme Industries'), 'multi-word token');
  assert.ok(caught('the acmeindustries account'), 'and that token run together');
});

test('innocent prose is not caught', () => {
  const { set, maxWords } = loadTokens('examplecorp\nacme industries\n');
  const caught = (line) => [...windows(line, maxWords)].some((w) => set.has(w));

  assert.ok(!caught('This gate holds mechanism only, never rule content.'));
  assert.ok(!caught('for example, a corp may adopt this'), 'non-adjacent words');
  assert.ok(!caught('industries vary in their conventions'), 'partial multi-word token');
});

test('an empty list yields an empty set, so the caller can fail closed', () => {
  const { set } = loadTokens('# only comments\n\n');
  assert.equal(set.size, 0);
});

// The one exemption. A licence must name its holder, so that line is allowed
// wherever it appears. It must not widen into a general escape hatch.
test('a copyright notice is exempt, in any comment syntax', () => {
  assert.ok(isCopyrightNotice('   Copyright 2026 ExampleCorp Ltd'));
  assert.ok(isCopyrightNotice('// Copyright (c) 2026 ExampleCorp'));
  assert.ok(isCopyrightNotice('# copyright 1999-2026 ExampleCorp'));
  assert.ok(isCopyrightNotice(' * © 2026 ExampleCorp'));
  assert.ok(isCopyrightNotice('<!-- Copyright 2026 ExampleCorp -->'));
});

// The token list must never resolve to a path inside this repository. A file
// of real identifiers in the working tree is one `git add -f` from a permanent
// public commit, and an ignore rule is a weaker defence than not having the
// file there at all.
test('the token list resolves only from outside the repo', () => {
  const flag = resolveTokensPath(['--tokens', '/somewhere/list'], {});
  assert.equal(flag, '/somewhere/list', 'explicit flag wins');

  const env = resolveTokensPath([], { GOVERNANCE_TOKENS: '/from/env' });
  assert.equal(env, '/from/env', 'env var is next');

  const fallback = resolveTokensPath([], {});
  assert.match(fallback, /[\\/]\.config[\\/]engineering-governance[\\/]tokens$/);

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  assert.ok(
    !resolve(fallback).startsWith(repoRoot),
    'the default must not sit inside the repository',
  );
});

test('flag beats env, so a caller can always override', () => {
  const both = resolveTokensPath(['--tokens', '/explicit'], { GOVERNANCE_TOKENS: '/env' });
  assert.equal(both, '/explicit');
});

// Regression: assistant hooks hand over an ABSOLUTE file_path. Joining that
// onto the repo root produced a path that does not exist, so the file was
// skipped and the gate reported clean. A silent pass in the authoring layer is
// the worst failure available to it, because the hook still looks installed.
test('an absolute path resolves to the same file as a relative one', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  const rel = resolveTarget('README.md');
  const abs = resolveTarget(join(repoRoot, 'README.md'));

  assert.equal(resolve(abs.abs), resolve(rel.abs), 'both must point at one file');
  assert.equal(abs.label, 'README.md', 'and report the same repo-relative label');
});

test('a path outside the repo keeps its own label rather than a ../ walk', () => {
  const outside = resolveTarget(resolve('/tmp/somewhere/else.md'));
  assert.ok(!outside.label.startsWith('..'), `got ${outside.label}`);
});

test('the copyright exemption does not widen into an escape hatch', () => {
  assert.ok(
    !isCopyrightNotice('Copyright applies to every ExampleCorp deployment'),
    'a sentence merely starting with the word must not qualify',
  );
  assert.ok(!isCopyrightNotice('ExampleCorp holds the copyright 2026'), 'notice must lead');
  assert.ok(!isCopyrightNotice('our client ExampleCorp'), 'ordinary prose');
  assert.ok(!isCopyrightNotice('// ExampleCorp API client'), 'ordinary comment');
});
