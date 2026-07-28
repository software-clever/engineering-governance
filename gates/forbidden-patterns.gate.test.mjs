// Proof for forbidden-patterns.
//
// The indentation cases are here on purpose. They demonstrate that opposite
// conventions are served by one capability, which is the claim that makes this
// engine portable at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { id, inputKind, configure, evaluate } from './forbidden-patterns.gate.mjs';

test('the gate declares its own contract', () => {
  assert.equal(id, 'forbidden-patterns');
  assert.equal(inputKind, 'text');
});

test('unconfigured, it does nothing', () => {
  assert.deepEqual(evaluate({ text: 'anything at all', path: 'a.md' }, configure({})), []);
  assert.deepEqual(evaluate({ text: 'anything', path: 'a.md' }, configure({ patterns: [] })), []);
});

// The portability claim, made concrete: two projects with opposite rules use
// the same gate and neither convention lives in the engine.
test('opposite indentation conventions are both expressible', () => {
  const tabs = configure({ patterns: [{ pattern: '^ ', message: 'indent with tabs' }] });
  const spaces = configure({ patterns: [{ pattern: '^\\t', message: 'indent with spaces' }] });

  const spaceIndented = { text: 'fn()\n  return 1', path: 'a.js' };
  const tabIndented = { text: 'fn()\n\treturn 1', path: 'a.js' };

  assert.equal(evaluate(spaceIndented, tabs).length, 1, 'tabs rule rejects space indent');
  assert.deepEqual(evaluate(tabIndented, tabs), [], 'and allows tab indent');

  assert.equal(evaluate(tabIndented, spaces).length, 1, 'spaces rule rejects tab indent');
  assert.deepEqual(evaluate(spaceIndented, spaces), [], 'and allows space indent');
});

test('a match is reported with its location and the adopter message', () => {
  const config = configure({ patterns: [{ pattern: 'FIXME', message: 'resolve before merge' }] });
  const found = evaluate({ text: 'clean\nFIXME later\nclean', path: 'a.js' }, config);

  assert.equal(found.length, 1);
  assert.equal(found[0].gateId, 'forbidden-patterns');
  assert.equal(found[0].line, 2);
  assert.equal(found[0].path, 'a.js');
  assert.equal(found[0].message, 'resolve before merge');
});

test('the message never quotes the matched line', () => {
  const config = configure({ patterns: [{ pattern: 'token', message: 'no tokens' }] });
  const [found] = evaluate({ text: 'my token is hunter2', path: 'a.md' }, config);

  assert.ok(!found.message.includes('hunter2'), 'must not echo the line');
});

test('a bare string pattern works and gets a generic message', () => {
  const config = configure({ patterns: ['FIXME'] });
  const [found] = evaluate({ text: 'FIXME', path: 'a.js' }, config);
  assert.match(found.message, /forbidden pattern/);
});

test('flags apply, and one finding per line', () => {
  const config = configure({ patterns: ['fixme'], flags: 'i' });
  const found = evaluate({ text: 'FIXME and FIXME\nclean\nFixMe', path: 'a.js' }, config);
  assert.deepEqual(
    found.map((f) => f.line),
    [1, 3],
  );
});

test('scope limits where it applies', () => {
  const config = configure({ patterns: ['FIXME'], include: ['\\.js$'], exclude: ['^vendor/'] });
  assert.equal(evaluate({ text: 'FIXME', path: 'src/a.js' }, config).length, 1);
  assert.deepEqual(evaluate({ text: 'FIXME', path: 'a.md' }, config), []);
  assert.deepEqual(evaluate({ text: 'FIXME', path: 'vendor/a.js' }, config), []);
});

// A stateful regex would carry lastIndex between lines and skip matches, so
// the gate would silently under-report. Refused rather than quietly stripped,
// because a gate that misses things while reporting success is worse than one
// that errors.
test('stateful regex flags are refused', () => {
  assert.throws(() => configure({ patterns: ['x'], flags: 'g' }), /without "g" or "y"/);
  assert.throws(() => configure({ patterns: ['x'], flags: 'y' }), /without "g" or "y"/);
});

test('bad config is rejected loudly rather than ignored', () => {
  assert.throws(() => configure({ pattern: ['x'] }), /unknown config key/i);
  assert.throws(() => configure({ patterns: 'x' }), /must be an array/);
  assert.throws(() => configure({ patterns: [''] }), /non-empty/);
  assert.throws(() => configure({ patterns: [{ pattern: '(' }] }), /invalid regex/);
  assert.throws(() => configure({ patterns: [{ pattern: 'x', message: 1 }] }), /must be a string/);
});
