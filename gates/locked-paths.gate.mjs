// Rejects changes to paths the adopter has locked.
//
// The point is not to make a file unchangeable. It is to make changing it a
// deliberate, visible act rather than a side effect of some larger commit.
// The escape hatch (`git commit --no-verify`) is intentional and leaves a
// trace; a lock nobody can ever lift just gets worked around invisibly.
//
// Additions are never blocked. A file that does not exist yet cannot be
// silently overwritten, and blocking additions would block the very commit
// that introduces a locked file. This is a fact about what locking protects
// against, not a preference.
//
// inputKind is "changes", not "text": the question is which paths a change set
// touches, and that has no answer when looking at a whole tree. The runner
// refuses to run this outside a change set rather than reporting a vacuous
// pass.
//
// Config:
//   { "paths": ["docs/DECISIONS.md"], "patterns": ["^\\.github/"] }

import { violation, rejectUnknownKeys } from './shared.mjs';

export const id = 'locked-paths';
export const describe = 'Rejects modification of paths locked against silent change.';
export const inputKind = 'changes';

const KEYS = ['paths', 'patterns', 'message'];

export function configure(params = {}) {
  rejectUnknownKeys(params, KEYS, id);
  const { paths, patterns, message } = params;

  if (paths !== undefined && !Array.isArray(paths)) {
    throw new TypeError(`${id}: "paths" must be an array`);
  }
  if (patterns !== undefined && !Array.isArray(patterns)) {
    throw new TypeError(`${id}: "patterns" must be an array`);
  }
  if (message !== undefined && typeof message !== 'string') {
    throw new TypeError(`${id}: "message" must be a string`);
  }

  return {
    // No defaults. Unconfigured, nothing is locked.
    paths: new Set(paths ?? []),
    patterns: (patterns ?? []).map((p) => {
      try {
        return new RegExp(p);
      } catch (cause) {
        throw new TypeError(`${id}: invalid regex ${p}`, { cause });
      }
    }),
    message:
      message ||
      'locked path. Unlock it deliberately, or bypass visibly with --no-verify.',
  };
}

export function evaluate({ changes } = {}, config) {
  if (config.paths.size === 0 && config.patterns.length === 0) return [];
  if (!Array.isArray(changes)) return [];

  return changes
    .filter(({ status }) => status !== 'A')
    .filter(({ path }) => config.paths.has(path) || config.patterns.some((re) => re.test(path)))
    .map(({ path }) => violation(id, config.message, { path }));
}
