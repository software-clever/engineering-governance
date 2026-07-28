# Rule register (template)

Copy this into your own private repository and replace the rules with yours.
Validate it with:

```sh
node <engine>/scripts/registry-check.mjs --register governance/rules.md
```

This file is a **template**. It lives here because the shape belongs to the
engine; the rules never do. Your register belongs in your repository, where
review of changes to it is what makes a rule live. The rules below are generic
illustrations chosen to show the format, not recommendations.

## Format

One rule per `### <ID>: <title>` section. Ids look like `R-1`, `SEC-12`, any
uppercase prefix plus a number. Fields are `- Label: value` bullets, matched
case-insensitively with punctuation folded, so `Superseded by` and
`superseded-by` are the same field. Bullets whose labels are not recognised are
ignored, so you can add prose freely.

| Field | Values | Meaning |
| --- | --- | --- |
| Statement | free text | What the rule requires, in one sentence |
| Rationale | free text | Why it exists. The part that survives a rewrite |
| Kind | `hard`, `soft` | Hard rules claim a binary outcome; soft rules shape judgement |
| Enforcement | a gate id, or `none` | The mechanism that makes it real |
| Status | `prose`, `partial`, `enforced` | How much of that mechanism actually exists |
| Precedence | integer | Higher wins when rules collide |
| Scope | free text | Where it applies |
| Provenance | `stated`, `inferred`, `open` | Whether it was decided, deduced, or is still open |
| Lifecycle | `active`, `superseded` | Superseded, never deleted |
| Superseded by | a rule id | Required when lifecycle is `superseded` |

## The rule about rules

`Status` may not overstate `Enforcement`. Claiming `enforced` or `partial`
while naming a gate that does not exist fails validation, so a register cannot
quietly award itself credit. A `hard` rule with `Enforcement: none` and
`Status: prose` is perfectly legal: an aspiration labelled as an aspiration is
honest, and it is the overclaim that does damage.

Changing a rule means **superseding it**, never editing it away. The old record
stays, pointing at its replacement, so why a decision changed remains readable.

### R-1: Generated files are not edited by hand

- Statement: Files produced by a generator are regenerated, never edited in place.
- Rationale: A hand edit to a generated file is silently destroyed on the next
  run, and the loss usually surfaces far from the cause.
- Kind: hard
- Enforcement: none
- Status: prose
- Precedence: 100
- Scope: every generated artefact in the repository
- Provenance: stated
- Lifecycle: active

An honest entry: the rule is binary, nothing enforces it yet, and it says so.

### R-2: Documentation moves with the behaviour it describes

- Statement: A change to described behaviour updates its documentation in the
  same change, or declares itself exempt.
- Rationale: Documentation reconciled later is documentation reconciled never,
  and stale docs are trusted until the moment they mislead.
- Kind: soft
- Enforcement: none
- Status: prose
- Precedence: 50
- Scope: repositories carrying reference documentation
- Provenance: stated
- Lifecycle: active

### R-3: Commit messages record why, not what

- Statement: A commit message explains the reason for the change; the diff
  already shows its content.
- Rationale: The diff is recoverable forever, the reasoning is not.
- Kind: soft
- Enforcement: none
- Status: prose
- Precedence: 40
- Scope: all repositories
- Provenance: stated
- Lifecycle: superseded
- Superseded by: R-2

A superseded entry stays in place and points forwards, so the record of the
decision survives. This one is superseded purely to demonstrate the shape.
