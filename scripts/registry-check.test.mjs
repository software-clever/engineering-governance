// Proofs for the rule register validator.
//
// Weighted towards what the validator must REJECT. A validator observed only
// accepting valid input has not been observed: the whole point is that a
// register cannot quietly claim more than it delivers.
//
// Every rule here is a placeholder. This file states no real convention.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverGateIds } from '../gates/registry.mjs';
import { FIELDS, parseRegister, validate, resolveRegisterPath } from './registry-check.mjs';

/** A minimal valid record, overridable per test. */
function rule(over = {}) {
  const fields = {
    statement: 'Placeholder statement.',
    rationale: 'Placeholder rationale.',
    kind: 'soft',
    enforcement: 'none',
    status: 'prose',
    precedence: '100',
    scope: 'everywhere',
    provenance: 'stated',
    lifecycle: 'active',
    ...over,
  };
  return [
    `### ${over.id ?? 'R-1'}: Placeholder`,
    ...Object.entries(fields)
      .filter(([k]) => k !== 'id')
      .map(([k, v]) => `- ${k}: ${v}`),
    '',
  ].join('\n');
}

function check(text, gates = []) {
  const { rules, problems } = parseRegister(text);
  return [...problems, ...validate(rules, gates)];
}

test('a well-formed register passes', () => {
  assert.deepEqual(check(rule()), []);
});

test('every declared field is required except supersededBy', () => {
  const optional = Object.entries(FIELDS)
    .filter(([, s]) => !s.required)
    .map(([k]) => k);
  assert.deepEqual(optional, ['supersededBy']);
});

test('a missing required field is reported, naming the field', () => {
  const text = rule().replace('- rationale: Placeholder rationale.\n', '');
  const problems = check(text);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /missing required field "rationale"/);
});

test('an out-of-range enum value is reported', () => {
  const problems = check(rule({ kind: 'mandatory' }));
  assert.match(problems[0].message, /"kind" is "mandatory", expected one of hard, soft/);
});

test('a non-integer precedence is reported', () => {
  const problems = check(rule({ precedence: 'high' }));
  assert.match(problems[0].message, /"precedence".*expected an integer/);
});

// The check the whole file exists for.
test('a status claiming enforcement by an unregistered gate fails', () => {
  // "partial" is held to the same standard as "enforced": it means the gate is
  // real but not yet everywhere, so a missing gate is equally false.
  for (const status of ['enforced', 'partial']) {
    const text = rule({ kind: 'hard', enforcement: 'forbidden-chars', status });

    const withoutGate = check(text, []);
    assert.equal(withoutGate.length, 1, status);
    assert.match(withoutGate[0].message, /not registered/, status);

    assert.deepEqual(check(text, ['forbidden-chars']), [], `${status} passes once the gate exists`);
  }
});

test('claiming enforcement with no mechanism at all fails', () => {
  for (const status of ['enforced', 'partial']) {
    const problems = check(rule({ kind: 'hard', enforcement: 'none', status }));
    assert.match(problems[0].message, /a claim with no mechanism/, status);
  }
});

test('an unenforced hard rule is legal when it says so', () => {
  const honest = rule({ kind: 'hard', enforcement: 'none', status: 'prose' });
  assert.deepEqual(check(honest), [], 'an aspiration labelled as one is not a lie');
});

test('supersede, never delete: the pointer must resolve', () => {
  const orphan = rule({ id: 'R-1', lifecycle: 'superseded', supersededBy: 'R-9' });
  assert.match(check(orphan)[0].message, /not a rule in this register/);

  const selfRef = rule({ id: 'R-1', lifecycle: 'superseded', supersededBy: 'R-1' });
  assert.match(check(selfRef)[0].message, /points at itself/);

  const missing = rule({ lifecycle: 'superseded' });
  assert.match(check(missing)[0].message, /without "supersededBy"/);

  const stray = rule({ lifecycle: 'active', supersededBy: 'R-2' });
  assert.match(check(stray)[0].message, /but supersededBy is set/);

  const good = rule({ id: 'R-1', lifecycle: 'superseded', supersededBy: 'R-2' }) + rule({ id: 'R-2' });
  assert.deepEqual(check(good), []);
});

test('duplicate ids and duplicate fields are both reported', () => {
  const dupId = rule({ id: 'R-1' }) + rule({ id: 'R-1' });
  assert.match(check(dupId).find((p) => /duplicate rule id/.test(p.message)).message, /R-1/);

  const dupField = rule() + '- kind: hard\n';
  assert.ok(check(dupField).some((p) => /duplicate field "kind"/.test(p.message)));
});

// A dropped rule is worse than a rejected one: it disappears from every later
// check while the register still looks valid.
test('a malformed heading is reported rather than silently skipped', () => {
  const problems = check('### not-an-id: Placeholder\n- kind: soft\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /heading is not/);
});

test('field labels tolerate spacing and case, and prose bullets are ignored', () => {
  const text = rule({ id: 'R-1', lifecycle: 'superseded' }).replace(
    '- lifecycle: superseded',
    '- Lifecycle: superseded\n- Superseded By: R-2\n- some prose bullet: ignored',
  );
  assert.deepEqual(check(text + rule({ id: 'R-2' })), []);
});

// A broken template is worse than none: it is copied before it is read.
test('the shipped template validates against this validator', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'register.example.md');
  const { rules, problems } = parseRegister(readFileSync(path, 'utf8'));

  assert.ok(rules.length > 0, 'the template must actually contain rules');
  assert.deepEqual([...problems, ...validate(rules, discoverGateIds())], []);
});

test('the register path resolves to the caller, never to this engine', () => {
  assert.equal(resolveRegisterPath(['--register', '/explicit.md'], {}), '/explicit.md');
  assert.equal(resolveRegisterPath([], { GOVERNANCE_REGISTER: '/from/env.md' }), '/from/env.md');
  assert.match(resolveRegisterPath([], {}), /governance[\\/]rules\.md$/);
});
