// Rejects lines matching patterns the adopter names. The general form of "no
// line may say X", which covers most content conventions a team actually has.
//
// Indentation is the clearest example that this is a capability and not a
// rule: "indent with tabs" is `^ ` (no leading space), "indent with two
// spaces" is `^\t` (no leading tab). Opposite conventions, same gate, and the
// engine takes no side.
//
// Its mirror is `required-patterns`. Absence is not the negation of presence:
// no configuration here can express "some line MUST match".
//
// Config:
//   { "patterns": [{ "pattern": "^ ", "message": "indent with tabs" }],
//     "flags": "i", "include": [...], "exclude": [...] }
//
// A pattern may be a bare string, in which case the message is generic.

import { compileScope, inScope, violation, lines, rejectUnknownKeys } from './shared.mjs';

export const id = 'forbidden-patterns';
export const describe = 'Rejects lines matching named regular expressions.';
export const inputKind = 'text';

const KEYS = ['patterns', 'flags', 'include', 'exclude'];

function compilePattern(entry, flags) {
  const raw = typeof entry === 'string' ? entry : entry?.pattern;
  if (typeof raw !== 'string' || raw === '') {
    throw new TypeError(`${id}: each pattern needs a non-empty "pattern" string`);
  }
  // The adopter writes the message, because only they know why the pattern
  // matters. Falling back to the pattern itself keeps a bare string usable.
  const message = typeof entry === 'string' ? `matches forbidden pattern /${raw}/` : entry.message;
  if (message !== undefined && typeof message !== 'string') {
    throw new TypeError(`${id}: "message" must be a string`);
  }
  try {
    return { re: new RegExp(raw, flags), message: message || `matches forbidden pattern /${raw}/` };
  } catch (cause) {
    throw new TypeError(`${id}: invalid regex ${raw}`, { cause });
  }
}

export function configure(params = {}) {
  rejectUnknownKeys(params, KEYS, id);
  const { patterns, flags } = params;
  if (patterns !== undefined && !Array.isArray(patterns)) {
    throw new TypeError(`${id}: patterns must be an array`);
  }
  // The global flag would make lastIndex carry between lines and silently skip
  // matches, so it is refused rather than quietly stripped.
  if (flags !== undefined && (typeof flags !== 'string' || /[gy]/.test(flags))) {
    throw new TypeError(`${id}: flags must be a string without "g" or "y"`);
  }
  return {
    // No default. Unconfigured, this gate is inert.
    patterns: (patterns ?? []).map((p) => compilePattern(p, flags)),
    scope: compileScope(params),
  };
}

export function evaluate({ text, path } = {}, config) {
  if (config.patterns.length === 0) return [];
  if (!inScope(path, config.scope)) return [];

  const found = [];
  lines(text).forEach((line, i) => {
    for (const { re, message } of config.patterns) {
      if (re.test(line)) {
        // The adopter's message, never the matched text: a violation reaches
        // CI logs, and quoting the line republishes what is being kept out.
        found.push(violation(id, message, { path, line: i + 1 }));
        break;
      }
    }
  });
  return found;
}
