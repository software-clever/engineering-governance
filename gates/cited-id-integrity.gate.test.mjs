// Proof for cited-id-integrity.

import test from 'node:test';
import assert from 'node:assert/strict';

import { id, inputKind, wants, configure, evaluate } from './cited-id-integrity.gate.mjs';

const known = { marker: 'RULE', ids: ['R-1', 'R-2', 'SEC-10'] };

test('the gate declares its own contract', () => {
  assert.equal(id, 'cited-id-integrity');
  assert.equal(inputKind, 'text');
});

test('unconfigured, it does nothing', () => {
  const inert = configure({});
  assert.deepEqual(evaluate({ text: 'RULE: R-99 nonsense', path: 'a.js' }, inert), []);
});

// The drift this exists to catch: a rule is superseded, its id leaves the
// register, and the comment goes on claiming a link to something absent.
test('a citation naming an unknown id is rejected', () => {
  const config = configure(known);
  const found = evaluate({ text: '// RULE: R-1 fine\n// RULE: R-99 stale', path: 'a.js' }, config);

  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
  assert.match(found[0].message, /R-99/);
  assert.equal(found[0].gateId, 'cited-id-integrity');
});

test('a citation naming a known id passes', () => {
  const config = configure(known);
  assert.deepEqual(evaluate({ text: '// RULE: SEC-10', path: 'a.js' }, config), []);
});

test('several citations on one line are all checked', () => {
  const config = configure(known);
  const found = evaluate({ text: 'RULE: R-1 and RULE: R-98 and RULE: R-97', path: 'a.js' }, config);
  assert.equal(found.length, 2);
});

test('spacing around the marker is tolerated', () => {
  const config = configure(known);
  for (const text of ['RULE:R-99', 'RULE: R-99', 'RULE  :  R-99']) {
    assert.equal(evaluate({ text, path: 'a.js' }, config).length, 1, text);
  }
});

test('a marker containing regex punctuation is matched literally', () => {
  const config = configure({ marker: '@rule(x)', ids: ['R-1'] });
  assert.equal(evaluate({ text: '@rule(x): R-9', path: 'a.js' }, config).length, 1);
  assert.deepEqual(evaluate({ text: '@ruleAx: R-9', path: 'a.js' }, config), [], 'not a wildcard');
});

// The honest limit, tested so it stays true rather than drifting into
// accidental false positives on prose.
test('only well-formed citations are checked, so ordinary prose is safe', () => {
  const config = configure(known);
  assert.deepEqual(evaluate({ text: 'RULE: always write the test first', path: 'a.md' }, config), []);
  assert.deepEqual(evaluate({ text: 'the R-99 identifier alone', path: 'a.md' }, config), []);
});

test('scope limits where it applies', () => {
  const config = configure({ ...known, include: ['\\.js$'] });
  assert.equal(evaluate({ text: 'RULE: R-99', path: 'a.js' }, config).length, 1);
  assert.deepEqual(evaluate({ text: 'RULE: R-99', path: 'a.md' }, config), []);
});

// The register has one home, supplied to the runner. Restating its path in
// gate config would give the same fact two places to disagree, and would force
// this gate to read files, which no gate should do.
test('ids arrive from the caller, not from a path in the config', () => {
  const config = configure({ marker: 'RULE' }, { ruleIds: ['R-1'] });
  assert.deepEqual(evaluate({ text: 'RULE: R-1', path: 'a.js' }, config), []);
  assert.equal(evaluate({ text: 'RULE: R-9', path: 'a.js' }, config).length, 1);

  assert.throws(
    () => configure({ marker: 'RULE', register: 'somewhere.md' }),
    /unknown config key/i,
    'a register path is not a gate concern',
  );
});

test('explicit ids override the caller, for a repo with no register', () => {
  const config = configure({ marker: 'RULE', ids: ['X-1'] }, { ruleIds: ['R-1'] });
  assert.deepEqual(evaluate({ text: 'RULE: X-1', path: 'a.js' }, config), []);
  assert.equal(evaluate({ text: 'RULE: R-1', path: 'a.js' }, config).length, 1);
});

// Without ids the gate is inert, which is silent. The runner must therefore
// announce the gap, so `wants` is part of the contract rather than a hint.
test('it declares what the runner must supply', () => {
  assert.deepEqual(wants, [{ name: 'ruleIds', orParam: 'ids' }]);

  const starved = configure({ marker: 'RULE' }, {});
  assert.deepEqual(evaluate({ text: 'RULE: R-9', path: 'a.js' }, starved), []);
});

test('bad config is rejected loudly rather than ignored', () => {
  assert.throws(() => configure({ mark: 'RULE' }), /unknown config key/i);
  assert.throws(() => configure({ marker: '' }), /non-empty string/);
  assert.throws(() => configure({ marker: 'RULE', ids: 'R-1' }), /"ids" must be an array/);
  assert.throws(() => configure({ ids: ['R-1'] }), /"marker" is required/);
});
