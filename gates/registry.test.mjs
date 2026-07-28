// Proof that the gate registry cannot drift from reality.
//
// Two couplings are enforced here rather than asked for in a comment:
//   1. A gate's exported id equals the id its filename implies.
//   2. Every gate has a proof file beside it.
//
// Together with the registry being derived from disk rather than written by
// hand, that means an id cannot exist without a gate, and a gate cannot exist
// without a test. A rule claiming `status: enforced` therefore names something
// that demonstrably works.
//
// With no gates built yet these pass over an empty set. They are not
// decoration: they bite the moment the first gate lands, which is exactly when
// the temptation to skip the proof appears.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { GATES_DIR, discoverGateIds, proofFileFor, moduleFileFor } from './registry.mjs';

const ids = discoverGateIds();

test('every gate exports the id its filename implies', async () => {
  for (const id of ids) {
    const mod = await import(`./${moduleFileFor(id)}`);
    assert.equal(
      mod.id,
      id,
      `${moduleFileFor(id)} exports id "${mod.id}", so the registry would resolve it as "${id}"`,
    );
  }
});

test('every gate has a proof beside it', () => {
  for (const id of ids) {
    assert.ok(
      existsSync(join(GATES_DIR, proofFileFor(id))),
      `gate "${id}" has no ${proofFileFor(id)}. A gate observed only passing has not been observed.`,
    );
  }
});

test('discovery reads the filesystem, so it cannot list a gate that is absent', () => {
  for (const id of ids) {
    assert.ok(existsSync(join(GATES_DIR, moduleFileFor(id))), `${id} was listed but has no module`);
  }
  assert.deepEqual(ids, [...ids].sort(), 'order is stable, so callers can rely on it');
});
