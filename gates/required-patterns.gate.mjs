// Requires that every file in scope contains a match. The mirror of
// `forbidden-patterns`, and not reducible to it: "no line may say X" and "some
// line must say X" are different questions, and no configuration of the first
// answers the second.
//
// The characteristic use is a header every source file must carry. Note the
// consequence of scope here: a required pattern with no `include` demands the
// match in EVERY file, which is almost never what anyone means. Scoping is
// effectively mandatory for this gate, so an unscoped config is refused rather
// than left to surprise someone.
//
// Config:
//   { "patterns": [{ "pattern": "Copyright", "message": "needs a header" }],
//     "flags": "i", "include": ["\\.ts$"], "exclude": [...] }

import { compileScope, inScope, violation, rejectUnknownKeys } from './shared.mjs';

export const id = 'required-patterns';
export const describe = 'Requires every file in scope to contain a match.';
export const inputKind = 'text';

const KEYS = ['patterns', 'flags', 'include', 'exclude'];

function compilePattern(entry, flags) {
  const raw = typeof entry === 'string' ? entry : entry?.pattern;
  if (typeof raw !== 'string' || raw === '') {
    throw new TypeError(`${id}: each pattern needs a non-empty "pattern" string`);
  }
  const message = typeof entry === 'string' ? undefined : entry.message;
  if (message !== undefined && typeof message !== 'string') {
    throw new TypeError(`${id}: "message" must be a string`);
  }
  try {
    return { re: new RegExp(raw, flags), message: message || `must contain a match for /${raw}/` };
  } catch (cause) {
    throw new TypeError(`${id}: invalid regex ${raw}`, { cause });
  }
}

export function configure(params = {}) {
  rejectUnknownKeys(params, KEYS, id);
  const { patterns, flags, include } = params;
  if (patterns !== undefined && !Array.isArray(patterns)) {
    throw new TypeError(`${id}: patterns must be an array`);
  }
  if (flags !== undefined && (typeof flags !== 'string' || /[gy]/.test(flags))) {
    throw new TypeError(`${id}: flags must be a string without "g" or "y"`);
  }
  // Unscoped, this gate would demand the pattern in every file in the
  // repository, including lockfiles and binaries. That is never the intent, so
  // it is an error rather than a surprise at the first run.
  if (patterns?.length > 0 && (!Array.isArray(include) || include.length === 0)) {
    throw new TypeError(
      `${id}: "include" is required. Without it every file in the repository ` +
        'would have to contain the pattern.',
    );
  }
  return {
    patterns: (patterns ?? []).map((p) => compilePattern(p, flags)),
    scope: compileScope(params),
  };
}

export function evaluate({ text, path } = {}, config) {
  if (config.patterns.length === 0) return [];
  if (!inScope(path, config.scope)) return [];

  // Tested against the whole file, not line by line: the question is whether
  // the file contains a match anywhere, and a multi-line pattern should be
  // able to span lines.
  const content = String(text ?? '');
  return config.patterns
    .filter(({ re }) => !re.test(content))
    // No line number: the finding is the absence of something, which has no
    // location. Pointing at line 1 would imply the problem is there.
    .map(({ message }) => violation(id, message, { path }));
}
