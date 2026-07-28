// Rejects code points the adopter names. It knows nothing about which ones
// matter to anyone: a gate that did would be carrying a house rule.
//
// Code points rather than characters, because the ones worth banning are
// usually the ones you cannot see. A look-alike space, a zero-width joiner or
// a stray control character all read as ordinary text in a diff, which is
// exactly why they survive review and need a machine to catch them.
//
// Config:
//   { "codepoints": ["U+2014", "U+00A0"], "include": [...], "exclude": [...] }
//
// Accepts "U+XXXX", "0x2014", a decimal number, or a single literal character.

import { compileScope, inScope, violation, lines, rejectUnknownKeys } from './shared.mjs';

export const id = 'forbidden-chars';
export const describe = 'Rejects named Unicode code points anywhere in a file.';
export const inputKind = 'text';

const KEYS = ['codepoints', 'include', 'exclude'];

function parseCodePoint(entry) {
  if (typeof entry === 'number') {
    if (!Number.isInteger(entry) || entry < 0 || entry > 0x10ffff) {
      throw new TypeError(`${id}: ${entry} is not a valid code point`);
    }
    return entry;
  }
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new TypeError(`${id}: codepoints entries must be strings or numbers`);
  }

  const hex = /^(?:U\+|0x)([0-9a-f]+)$/i.exec(entry);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    if (value > 0x10ffff) throw new TypeError(`${id}: ${entry} is out of range`);
    return value;
  }
  if (/^\d+$/.test(entry)) return Number.parseInt(entry, 10);

  // A literal character. [...entry] iterates by code point, so an astral
  // character such as an emoji counts as one entry rather than two halves of a
  // surrogate pair.
  const points = [...entry];
  if (points.length !== 1) {
    throw new TypeError(
      `${id}: "${entry}" is neither a single character nor a code point like U+2014`,
    );
  }
  return points[0].codePointAt(0);
}

export function configure(params = {}) {
  rejectUnknownKeys(params, KEYS, id);
  const { codepoints } = params;
  if (codepoints !== undefined && !Array.isArray(codepoints)) {
    throw new TypeError(`${id}: codepoints must be an array`);
  }
  return {
    // No default. Unconfigured, this gate is inert, which is correct: the
    // engine has no view on which code points anyone should ban.
    codepoints: new Set((codepoints ?? []).map(parseCodePoint)),
    scope: compileScope(params),
  };
}

export function evaluate({ text, path } = {}, config) {
  if (config.codepoints.size === 0) return [];
  if (!inScope(path, config.scope)) return [];

  const found = [];
  lines(text).forEach((line, i) => {
    // Iterating with for..of walks code points, not UTF-16 units, so an
    // astral character is compared as itself rather than as a surrogate half.
    for (const ch of line) {
      const point = ch.codePointAt(0);
      if (config.codepoints.has(point)) {
        // The code point is named, the surrounding text is not. A message
        // quoting the line would republish it into CI logs.
        found.push(
          violation(id, `forbidden code point U+${point.toString(16).toUpperCase().padStart(4, '0')}`, {
            path,
            line: i + 1,
          }),
        );
        break; // One finding per line is enough to send someone to it.
      }
    }
  });
  return found;
}
