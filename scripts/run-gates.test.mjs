// Proof for the gate runner.
//
// The runner is where a misconfiguration turns into a false sense of safety,
// so most of this covers what it must REFUSE rather than what it accepts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverGateIds } from '../gates/registry.mjs';
import {
  stripComments,
  loadGates,
  evaluateAll,
  resolveConfigPath,
  diffArgsFor,
  namedPaths,
} from './run-gates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A typo in a gate name would leave the adopter believing a rule is enforced
// while nothing runs: this engine's own failure mode, one level down.
test('an unknown gate id is an error, never a skip', async () => {
  await assert.rejects(() => loadGates({ 'forbiden-chars': {} }), /no gate named "forbiden-chars"/);
});

test('bad gate parameters surface from configure rather than being swallowed', async () => {
  await assert.rejects(() => loadGates({ 'forbidden-chars': { codepoint: [] } }), /unknown config key/i);
});

test('a comment key is dropped, but only when it is exactly "//"', () => {
  assert.deepEqual(stripComments({ '//': 'note', a: 1 }), { a: 1 });
  assert.deepEqual(stripComments({ a: { '//': 'note', b: 2 } }), { a: { b: 2 } });
  assert.deepEqual(stripComments({ '//todo': 'x' }), { '//todo': 'x' }, 'prefix is not a comment');
  assert.deepEqual(stripComments({ a: ['//', 'kept'] }), { a: ['//', 'kept'] }, 'arrays untouched');
});

test('comments survive a real load, so a config can explain itself', async () => {
  const gates = await loadGates({
    '//': 'why these are banned',
    'forbidden-chars': { '//': 'invisible characters', codepoints: ['U+00A0'] },
  });
  assert.equal(gates.length, 1);
  assert.equal(gates[0].mod.id, 'forbidden-chars');
});

test('an empty config loads nothing rather than assuming anything', async () => {
  assert.deepEqual(await loadGates({}), []);
});

test('a text gate sees each readable file in turn', async () => {
  const gates = await loadGates({ 'forbidden-chars': { codepoints: ['U+00A0'] } });
  const findings = evaluateAll(gates, [
    { path: 'a.md', text: 'clean' },
    { path: 'b.md', text: 'has one' },
    { path: 'c.bin', text: null },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'b.md');
});

test('unreadable or binary files are skipped, not reported as clean failures', async () => {
  const gates = await loadGates({ 'forbidden-chars': { codepoints: ['U+00A0'] } });
  assert.deepEqual(evaluateAll(gates, [{ path: 'x.bin', text: null }]), []);
});

test('a changes gate sees the change set once', async () => {
  const gates = await loadGates({ 'locked-paths': { paths: ['locked.md'] } });
  const findings = evaluateAll(
    gates,
    [],
    [
      { path: 'locked.md', status: 'M' },
      { path: 'other.md', status: 'M' },
    ],
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, 'locked.md');
});

// A gate contributing nothing while the run still goes green is worse than one
// that errors: the tick reads as protection either way.
test('a changes gate outside a change set warns rather than passing quietly', async () => {
  const gates = await loadGates({ 'locked-paths': { paths: ['locked.md'] } });
  const warnings = [];

  const findings = evaluateAll(gates, [{ path: 'locked.md', text: 'x' }], null, (m) =>
    warnings.push(m),
  );

  assert.deepEqual(findings, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /locked-paths needs a change set and was NOT run/);
});

test('the config path resolves to the caller, never to this engine', () => {
  assert.equal(resolveConfigPath(['--config', '/explicit.json'], {}), '/explicit.json');
  assert.equal(resolveConfigPath([], { GOVERNANCE_GATES: '/env.json' }), '/env.json');
  assert.match(resolveConfigPath([], {}), /governance[\\/]gates\.json$/);
});

// A broken template is worse than none: it is copied before it is read. It
// must load exactly as shipped, with no paths rewritten, which is only
// possible because no gate config names a file.
test('the shipped template loads exactly as shipped', async () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'gates.example.json'), 'utf8'));
  const gates = await loadGates(raw, discoverGateIds(), { ruleIds: ['R-1'] });

  assert.ok(gates.length > 0, 'the template must configure something');
  assert.deepEqual(
    gates.map((g) => g.mod.id).sort(),
    Object.keys(raw)
      .filter((k) => k !== '//')
      .sort(),
    'every gate in the template is loaded, so none is silently skipped',
  );
});

// Nothing is staged in CI, so without a range a gate of inputKind "changes"
// could never run at the only stage that decides.
test('a change set comes from staging or from a range', () => {
  assert.deepEqual(diffArgsFor(['--staged']), ['diff', '--cached']);
  assert.deepEqual(diffArgsFor(['--range', 'main...HEAD']), ['diff', 'main...HEAD']);
  assert.equal(diffArgsFor(['--all']), null, 'a whole tree is not a change set');
  assert.equal(diffArgsFor([]), null);
});

// Picking one silently would leave the run green while it checked something
// other than what was asked for.
test('two change sets at once is an error, not a quiet preference', () => {
  assert.throws(() => diffArgsFor(['--staged', '--range', 'main...HEAD']), /alternatives/);
});

// An empty range would otherwise reach git as no argument at all, which
// resolves to the working tree: a narrower check than the caller asked for,
// passing under the name of a wider one.
test('--range without a range is an error rather than a silent whole-tree diff', () => {
  assert.throws(() => diffArgsFor(['--range']), /needs a git range/);
  assert.throws(() => diffArgsFor(['--range', '--config', 'x.json']), /needs a git range/);
});

// A flag's value read as a filename would scan the wrong file and, worse,
// report it clean.
test('a flag consumes its value instead of it becoming a target path', () => {
  assert.deepEqual(namedPaths(['--register', 'rules.md', 'src/a.js']), ['src/a.js']);
  assert.deepEqual(namedPaths(['--config', 'gates.json', '--range', 'main...HEAD']), []);
  assert.deepEqual(namedPaths(['a.md', 'b.md']), ['a.md', 'b.md']);
});

// A gate left inert for want of data is silent, and silence behind a green
// tick reads as protection.
test('a gate missing the data it declared is announced, not left quiet', async () => {
  const warnings = [];
  await loadGates({ 'cited-id-integrity': { marker: 'RULE' } }, discoverGateIds(), {}, (m) =>
    warnings.push(m),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cited-id-integrity needs "ruleIds"/);

  const supplied = [];
  await loadGates(
    { 'cited-id-integrity': { marker: 'RULE' } },
    discoverGateIds(),
    { ruleIds: ['R-1'] },
    (m) => supplied.push(m),
  );
  assert.deepEqual(supplied, [], 'silent once the data arrives');

  const explicit = [];
  await loadGates({ 'cited-id-integrity': { marker: 'RULE', ids: ['R-1'] } }, discoverGateIds(), {}, (m) =>
    explicit.push(m),
  );
  assert.deepEqual(explicit, [], 'and when the config supplies it instead');
});
