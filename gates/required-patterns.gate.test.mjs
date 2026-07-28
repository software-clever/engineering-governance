// Proof for required-patterns.
//
// The case that matters most is the one forbidden-patterns cannot express: a
// file failing because something is ABSENT. That asymmetry is the reason this
// gate exists at all, so it is tested directly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { id, inputKind, configure, evaluate } from './required-patterns.gate.mjs';

const header = { patterns: [{ pattern: 'Copyright', message: 'needs a header' }], include: ['\\.js$'] };

test('the gate declares its own contract', () => {
  assert.equal(id, 'required-patterns');
  assert.equal(inputKind, 'text');
});

test('unconfigured, it does nothing', () => {
  assert.deepEqual(evaluate({ text: '', path: 'a.js' }, configure({})), []);
  assert.deepEqual(evaluate({ text: '', path: 'a.js' }, configure({ patterns: [] })), []);
});

// The asymmetry this gate exists for.
test('absence fails, presence passes', () => {
  const config = configure(header);

  const missing = evaluate({ text: 'const a = 1;', path: 'a.js' }, config);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].gateId, 'required-patterns');
  assert.equal(missing[0].message, 'needs a header');
  assert.equal(missing[0].path, 'a.js');

  assert.deepEqual(evaluate({ text: '// Copyright 2026\nconst a = 1;', path: 'a.js' }, config), []);
});

// A missing thing has no location. Reporting line 1 would point at innocent
// code and send the reader to the wrong place.
test('a finding carries no line number', () => {
  const [found] = evaluate({ text: 'const a = 1;', path: 'a.js' }, configure(header));
  assert.equal(found.line, undefined);
});

test('the match may span lines, because the file is tested whole', () => {
  const config = configure({
    patterns: [{ pattern: 'start[\\s\\S]*end', message: 'needs the block' }],
    include: ['\\.md$'],
  });
  assert.deepEqual(evaluate({ text: 'start\nmiddle\nend', path: 'a.md' }, config), []);
  assert.equal(evaluate({ text: 'start\nmiddle', path: 'a.md' }, config).length, 1);
});

test('each unmet pattern is reported separately', () => {
  const config = configure({
    patterns: ['alpha', 'beta'],
    include: ['\\.md$'],
  });
  assert.equal(evaluate({ text: 'alpha only', path: 'a.md' }, config).length, 1);
  assert.equal(evaluate({ text: 'neither', path: 'a.md' }, config).length, 2);
});

test('files out of scope are not required to contain anything', () => {
  const config = configure(header);
  assert.deepEqual(evaluate({ text: 'no header here', path: 'a.md' }, config), []);

  const excluded = configure({ ...header, exclude: ['^vendor/'] });
  assert.deepEqual(evaluate({ text: 'no header', path: 'vendor/a.js' }, excluded), []);
});

// Unscoped, this gate would demand the pattern in lockfiles, fixtures and
// binaries. Nobody means that, and discovering it at the first run is a worse
// experience than being told at configure time.
test('an unscoped config is refused rather than surprising someone', () => {
  assert.throws(() => configure({ patterns: ['Copyright'] }), /"include" is required/);
  assert.throws(() => configure({ patterns: ['Copyright'], include: [] }), /"include" is required/);

  assert.doesNotThrow(() => configure({ patterns: [], include: undefined }), 'inert stays legal');
});

test('bad config is rejected loudly rather than ignored', () => {
  assert.throws(() => configure({ pattern: ['x'] }), /unknown config key/i);
  assert.throws(() => configure({ patterns: 'x' }), /must be an array/);
  assert.throws(() => configure({ patterns: [''], include: ['x'] }), /non-empty/);
  assert.throws(() => configure({ patterns: ['x'], include: ['x'], flags: 'g' }), /without "g"/);
  assert.throws(() => configure({ patterns: [{ pattern: '(' }], include: ['x'] }), /invalid regex/);
});
