// Proof for locked-paths.

import test from 'node:test';
import assert from 'node:assert/strict';

import { id, inputKind, configure, evaluate } from './locked-paths.gate.mjs';

const locked = { paths: ['docs/DECISIONS.md'], patterns: ['^\\.github/'] };

test('the gate declares its own contract', () => {
  assert.equal(id, 'locked-paths');
  assert.equal(inputKind, 'changes', 'it reads a change set, not file content');
});

test('unconfigured, nothing is locked', () => {
  const inert = configure({});
  assert.deepEqual(evaluate({ changes: [{ path: 'anything', status: 'M' }] }, inert), []);
});

test('a modified locked path is rejected, by exact path or by pattern', () => {
  const config = configure(locked);
  const found = evaluate(
    {
      changes: [
        { path: 'docs/DECISIONS.md', status: 'M' },
        { path: '.github/workflows/ci.yml', status: 'M' },
        { path: 'src/ordinary.js', status: 'M' },
      ],
    },
    config,
  );

  assert.deepEqual(
    found.map((f) => f.path),
    ['docs/DECISIONS.md', '.github/workflows/ci.yml'],
  );
  assert.equal(found[0].gateId, 'locked-paths');
});

// A file that does not exist yet cannot be silently overwritten, and blocking
// additions would block the very commit that introduces a locked file.
test('additions are never blocked', () => {
  const config = configure(locked);
  assert.deepEqual(evaluate({ changes: [{ path: 'docs/DECISIONS.md', status: 'A' }] }, config), []);
});

test('deletions and renames are blocked, because both lose the original', () => {
  const config = configure(locked);
  for (const status of ['D', 'R', 'M']) {
    assert.equal(
      evaluate({ changes: [{ path: 'docs/DECISIONS.md', status }] }, config).length,
      1,
      `status ${status}`,
    );
  }
});

test('the message points at the escape hatch, because an unliftable lock gets routed around', () => {
  const [found] = evaluate({ changes: [{ path: 'docs/DECISIONS.md', status: 'M' }] }, configure(locked));
  assert.match(found.message, /--no-verify/);

  const custom = configure({ ...locked, message: 'ask the owner first' });
  const [own] = evaluate({ changes: [{ path: 'docs/DECISIONS.md', status: 'M' }] }, custom);
  assert.equal(own.message, 'ask the owner first');
});

test('no change set yields nothing, leaving the runner to warn about it', () => {
  const config = configure(locked);
  assert.deepEqual(evaluate({}, config), []);
  assert.deepEqual(evaluate({ changes: undefined }, config), []);
});

test('bad config is rejected loudly rather than ignored', () => {
  assert.throws(() => configure({ path: [] }), /unknown config key/i);
  assert.throws(() => configure({ paths: 'x' }), /must be an array/);
  assert.throws(() => configure({ patterns: 'x' }), /must be an array/);
  assert.throws(() => configure({ patterns: ['('] }), /invalid regex/);
  assert.throws(() => configure({ message: 1 }), /must be a string/);
});
