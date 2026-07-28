// The gate ids this engine provides.
//
// A rule may only claim `status: enforced` if its `enforcement` field names a
// gate that actually exists. This is what "actually exists" resolves to, and it
// is why that claim cannot be made on paper alone.
//
// The list is DERIVED from the files on disk, never hand-maintained. A written
// list would let an id be added ahead of its gate, so a rule could claim
// enforcement that nothing delivers, which is the precise failure this project
// exists to prevent. Deriving it makes that state unrepresentable rather than
// merely discouraged.
//
// `registry.test.mjs` closes the other half: every discovered gate must export
// the id its filename implies, and must have a proof beside it. So a gate
// cannot exist without a test any more than an id can exist without a gate.
//
// Adopters with their own gates pass those ids via --gates rather than editing
// anything here. Their gates are theirs, not the engine's.

import { readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

const GATE_SUFFIX = '.gate.mjs';

/** Gate ids present on disk, sorted. A file named `<id>.gate.mjs` is gate `<id>`. */
export function discoverGateIds(dir = GATES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(GATE_SUFFIX))
    .map((f) => f.slice(0, -GATE_SUFFIX.length))
    .sort();
}

/** The file a gate's proof must live in, given its id. */
export function proofFileFor(id) {
  return `${id}.gate.test.mjs`;
}

/** The module a gate lives in, given its id. */
export function moduleFileFor(id) {
  return `${id}${GATE_SUFFIX}`;
}
