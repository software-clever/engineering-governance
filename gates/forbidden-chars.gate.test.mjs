// Proof for forbidden-chars.
//
// Weighted towards what it rejects and, just as important, that it is INERT
// when unconfigured. A gate that quietly acquires an opinion is the failure
// this engine exists to prevent, so "does nothing by default" is tested as
// deliberately as "blocks when told to".
//
// The code points used here are chosen for being uncontroversial and
// invisible. They illustrate the capability and imply no house rule.

import test from 'node:test';
import assert from 'node:assert/strict';

import { id, inputKind, configure, evaluate } from './forbidden-chars.gate.mjs';

const NBSP = ' '; // non-breaking space
const ZWSP = '​'; // zero-width space

test('the gate declares its own contract', () => {
  assert.equal(id, 'forbidden-chars');
  assert.equal(inputKind, 'text');
});

// The property that keeps the engine portable.
test('unconfigured, it does nothing', () => {
  const inert = configure({});
  assert.deepEqual(evaluate({ text: `a${NBSP}b${ZWSP}c`, path: 'a.md' }, inert), []);

  const empty = configure({ codepoints: [] });
  assert.deepEqual(evaluate({ text: `a${NBSP}b`, path: 'a.md' }, empty), []);
});

test('a named code point is rejected, with its location', () => {
  const config = configure({ codepoints: ['U+00A0'] });
  const found = evaluate({ text: `clean\nhas${NBSP}one\nclean`, path: 'a.md' }, config);

  assert.equal(found.length, 1);
  assert.equal(found[0].gateId, 'forbidden-chars');
  assert.equal(found[0].line, 2);
  assert.equal(found[0].path, 'a.md');
});

// Violations reach CI logs and pull requests. Echoing the text would republish
// the thing being kept out, which is the whole point of catching it.
test('the message names the code point but never quotes the text', () => {
  const config = configure({ codepoints: ['U+00A0'] });
  const [found] = evaluate({ text: `secret${NBSP}sauce`, path: 'a.md' }, config);

  assert.match(found.message, /U\+00A0/);
  assert.ok(!found.message.includes('secret'), 'must not echo surrounding text');
  assert.ok(!found.message.includes(NBSP), 'must not echo the character itself');
});

test('code points are accepted in every reasonable spelling', () => {
  for (const spelling of ['U+00A0', 'u+00a0', '0x00A0', '160', NBSP, 160]) {
    const config = configure({ codepoints: [spelling] });
    assert.equal(
      evaluate({ text: `a${NBSP}b`, path: 'a.md' }, config).length,
      1,
      `spelling ${JSON.stringify(spelling)}`,
    );
  }
});

test('an astral character counts as one code point, not two surrogates', () => {
  const astral = '\u{1F600}';
  const config = configure({ codepoints: [astral] });

  assert.equal(evaluate({ text: `a${astral}b`, path: 'a.md' }, config).length, 1);
  assert.deepEqual(
    evaluate({ text: 'a\ud83db', path: 'a.md' }, config),
    [],
    'a lone surrogate is not the astral character',
  );
});

test('one finding per line, so a bad file does not bury the report', () => {
  const config = configure({ codepoints: ['U+00A0'] });
  const text = `${NBSP}${NBSP}${NBSP}\nclean\n${NBSP}`;

  const found = evaluate({ text, path: 'a.md' }, config);
  assert.deepEqual(
    found.map((f) => f.line),
    [1, 3],
  );
});

test('scope limits where it applies', () => {
  const config = configure({ codepoints: ['U+00A0'], include: ['\\.md$'] });
  assert.equal(evaluate({ text: `a${NBSP}b`, path: 'doc.md' }, config).length, 1);
  assert.deepEqual(evaluate({ text: `a${NBSP}b`, path: 'code.js' }, config), []);

  const excluded = configure({ codepoints: ['U+00A0'], exclude: ['^vendor/'] });
  assert.deepEqual(evaluate({ text: `a${NBSP}b`, path: 'vendor/x.md' }, excluded), []);
  assert.equal(evaluate({ text: `a${NBSP}b`, path: 'src/x.md' }, excluded).length, 1);
});

// A silently ignored key is a rule the adopter believes is enforced and is
// not: this engine's own failure mode, reproduced one level down.
test('bad config is rejected loudly rather than ignored', () => {
  assert.throws(() => configure({ codepoint: ['U+00A0'] }), /unknown config key/i);
  assert.throws(() => configure({ codepoints: 'U+00A0' }), /must be an array/);
  assert.throws(() => configure({ codepoints: ['not a code point'] }), /neither a single/);
  assert.throws(() => configure({ codepoints: ['U+110000'] }), /out of range/);
  assert.throws(() => configure({ codepoints: ['U+00A0'], include: '\\.md$' }), /must be an array/);
  assert.throws(() => configure({ codepoints: ['U+00A0'], include: ['('] }), /invalid regex/);
});
