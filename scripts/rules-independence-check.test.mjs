// Proof for the rules-independence check.
//
// This guards the claim the whole model rests on, so the cases that matter are
// the ones it must REFUSE. A version of this that only ever passed would be
// indistinguishable from no check at all, and would read as protection.

import test from 'node:test';
import assert from 'node:assert/strict';

import { collect, one, sameCommit, verdict } from './rules-independence-check.mjs';

const A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const B = 'ffeeddccbbaa00112233445566778899aabbccdd';

test('rules taken from the commit under review are refused', () => {
  assert.match(verdict(A, [A]), /weaken the rule that judges it/);
});

test('rules taken from a ratified ref are allowed', () => {
  assert.equal(verdict(A, [B]), null);
});

// The workflow compares against more than one commit, because a pull request
// has both a head and a merge commit and either would carry the branch's rules.
test('every commit offered is compared, not just the first', () => {
  assert.match(verdict(A, [B, A]), /weaken the rule/);
});

// A short id reading as a different commit would pass exactly the case this
// exists to catch, so abbreviation must not decide the answer.
test('an abbreviated id still matches its full form', () => {
  assert.match(verdict(A, [A.slice(0, 7)]), /weaken the rule/);
  assert.match(verdict(A.slice(0, 12), [A]), /weaken the rule/);
});

test('case and surrounding whitespace do not change the verdict', () => {
  assert.match(verdict(A, [` ${A.toUpperCase()}\n`]), /weaken the rule/);
});

// Below git's own abbreviation floor a prefix starts matching unrelated
// commits, which would fail a run for no reason.
test('an id too short to be meaningful is not treated as a match', () => {
  assert.equal(sameCommit(A, A.slice(0, 6)), false);
  assert.equal(sameCommit(A, ''), false);
  assert.equal(sameCommit(undefined, A), false);
});

test('different commits are different however they are written', () => {
  assert.equal(sameCommit(A, B), false);
  assert.equal(sameCommit(A.slice(0, 8), B.slice(0, 8)), false);
});

test('arguments are read as given, repeated flags included', () => {
  assert.deepEqual(collect(['--not', A, '--not', B], '--not'), [A, B]);
  assert.deepEqual(collect(['--rules', 'r'], '--not'), []);
  assert.equal(one(['--rules', 'r', '--not', A], '--rules'), 'r');
  assert.equal(one(['--not', A], '--rules'), undefined);
});

// A workflow expression that resolves to nothing collapses its argument, so
// the flag that followed it would be read as the commit and match nothing.
// That is a silent pass of the one case this check exists to catch, so an
// empty value must leave the list empty and trip the fail-closed path.
test('a flag is never mistaken for the value of the flag before it', () => {
  assert.deepEqual(collect(['--not', '--rules', 'dir'], '--not'), []);
  assert.equal(one(['--rules', '--not', A], '--rules'), undefined);
});
