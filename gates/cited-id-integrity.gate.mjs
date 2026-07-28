// Rejects citations in source that point at rule ids which do not exist.
//
// Teams mark code with the rule it implements: a comment reading
// "<marker>: R-4" beside the thing that enforces R-4. The marker is worth
// nothing if it can rot. A rule gets superseded, its id disappears from the
// register, and the comment goes on claiming a link to something that is no
// longer there. This closes that gap in the direction a machine can check.
//
// The register's LOCATION is not configured here. It is already a first-class
// concept the caller supplies once, via --register or $GOVERNANCE_REGISTER,
// and restating it in gate config would give the same fact two homes free to
// disagree. The runner resolves it and injects the ids, which also keeps this
// gate free of file I/O: `configure` is pure, so a configuration can be
// validated anywhere, including in a repository that has no register.
//
// The engine has no view on what the marker word should be, so there is no
// default: unconfigured, this gate is inert.
//
// Config:
//   { "marker": "RULE", "include": [...], "exclude": [...] }
//
// Or with the ids given directly, when there is no register at all:
//   { "marker": "RULE", "ids": ["R-1", "R-2"] }

import { compileScope, inScope, violation, lines, rejectUnknownKeys } from './shared.mjs';

export const id = 'cited-id-integrity';
export const describe = 'Rejects rule citations that name an id no register defines.';
export const inputKind = 'text';

// Declares what the runner must supply beyond the adopter's own config, and
// which config key supplies it instead. The runner warns loudly when neither
// arrives, rather than leaving the gate inert behind a green tick.
export const wants = [{ name: 'ruleIds', orParam: 'ids' }];

const KEYS = ['marker', 'ids', 'include', 'exclude'];

// The same id shape the register itself uses, so the two cannot disagree about
// what an id looks like.
const ID = '[A-Z][A-Z0-9]*-\\d+';

export function configure(params = {}, context = {}) {
  rejectUnknownKeys(params, KEYS, id);
  const { marker, ids } = params;

  if (marker === undefined) {
    // Inert, and legitimately so: no marker means nothing to look for.
    if (ids !== undefined) throw new TypeError(`${id}: "marker" is required when ids are given`);
    return { marker: null, ids: new Set(), scope: compileScope(params) };
  }
  if (typeof marker !== 'string' || marker.trim() === '') {
    throw new TypeError(`${id}: "marker" must be a non-empty string`);
  }
  if (ids !== undefined && !Array.isArray(ids)) {
    throw new TypeError(`${id}: "ids" must be an array`);
  }

  // Explicit ids win, so a repository with no register can still use this.
  const known = ids !== undefined ? new Set(ids) : new Set(context.ruleIds ?? []);

  return {
    marker,
    ids: known,
    // Escaped, so a marker containing regex punctuation is matched literally.
    re: new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(${ID})`, 'g'),
    scope: compileScope(params),
  };
}

export function evaluate({ text, path } = {}, config) {
  if (!config.marker || config.ids.size === 0) return [];
  if (!inScope(path, config.scope)) return [];

  const found = [];
  lines(text).forEach((line, i) => {
    for (const match of line.matchAll(config.re)) {
      if (!config.ids.has(match[1])) {
        // The id is named because it is the thing to fix, and it is already
        // known to be absent from the register, so it reveals nothing.
        found.push(
          violation(id, `cites "${match[1]}", which no rule defines`, { path, line: i + 1 }),
        );
      }
    }
  });
  return found;
}
