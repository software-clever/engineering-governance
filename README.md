# engineering-governance

An engine for making engineering rules enforceable rather than merely written.

It holds **mechanism only**. It contains no rules, no house style, no company
names and no opinions about how anyone should work. The business adopting it
supplies all of that from a separate repository of their own. That separation is
what makes the engine portable between organisations, and it is enforced by a
gate rather than promised in a paragraph.

## The problem

Written rules do not hold. Prose reliably shapes soft behaviour, things like
tone and framing, but it does not hold hard constraints: a rule that claims a
binary outcome ("never emit X") and is backed only by a document is not a rule,
it is a hope. Both people and language models read such a rule and act against
it, and neither is being careless when they do. Nothing stopped them.

The governing principle here follows from that:

> **Every hard rule names its enforcement mechanism, or it is downgraded to a
> guideline.**

A rule may sit at `status: prose` for as long as you like. What it may not do
is claim to be enforced while nothing enforces it, because an overclaimed
guardrail is worse than a missing one. People stop checking.

## The three layers

The separation that makes the engine portable, and the reason it can be shared
without sharing anything about you.

| Layer | Holds | Example | Where it lives | Visibility |
| --- | --- | --- | --- | --- |
| **1. Mechanism** | Registry schema, validator, workflow plumbing, hook installers, gate interface | "A hard rule naming an unregistered gate fails the build" | This repo | Public |
| **2. Capability gates** | Parameterised checkers, shipped with no defaults | `forbidden-chars`, taking a codepoint list | This repo | Public |
| **3. Rules and config** | The rule records, and the parameters they pass to gates | "R-1: no em dashes. Hard. `forbidden-chars` with `U+2014`" | Your instance repo | Your choice |

Three things the visibility column is saying, each of which is a decision rather
than an accident:

- **The engine is public**, so that a repository of any visibility can call it.
  A public repository can only call a reusable workflow held in a public one, so
  a private engine would quietly exclude every open project from being governed.
- **The instance is a separate repository, read at a ratified ref**, and whether
  it is public or private is yours to pick. What makes the model work is
  separation and controlled write access, not secrecy. The trade-off between the
  two choices is set out in [`ADOPTING.md`](ADOPTING.md).
- **The token list is in neither**, living outside every repository. It is the
  one part of layer 3 that is genuinely confidential, and keeping it out is what
  leaves the instance free to be public at all.

Layer 2 is where portability is won or lost. A gate named after a house rule,
or one that ships that rule as a default, has collapsed layers 2 and 3 and is
no longer portable: it now carries an opinion, and a business with different
conventions cannot use it unmodified.

So **no gate in this repo ships a default**. A gate with a default is a leaked
opinion. An unconfigured gate does nothing, and that is correct.

The acceptance test for the whole split:

> Read this repository end to end and learn nothing about any business using
> it.

### The engine never depends on adopter data

Dependencies point **from** the adopter **to** the engine, never the reverse.
This is not tidiness; reversing it deadlocks the project.

If the engine's own build or CI needed a rule register or a token list, the
engine could not be built, tested or contributed to until an adopter existed.
Writing the engine and using it are different jobs, and the first has to work
on its own.

So every job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on a
bare checkout with no secrets and no adopter configuration. Applying a gate to a
particular organisation's identifiers is that organisation's job, run from their
side with their own data. It also means the arrangement survives publication:
reading a public engine from a private instance needs no credential, whereas a
public engine reading a private instance would need one stored in public.

## Defence in depth

Three stages of enforcement, each catching what the one before it misses. These
are enforcement stages, a different axis from the three content layers above.

| Stage | Mechanism | Catches | Does not catch |
| --- | --- | --- | --- |
| **L1, authoring** | Assistant hooks (see `adapters/`) | An AI assistant's own output, as it is written | Anything a human types, or a different tool |
| **L2, commit** | Git hooks, plain shell | Human and machine edits alike, before they leave the machine | `--no-verify`, and a clone that never installed the hooks |
| **L3, CI** | Required status checks on a pull request | Everything that reaches a pull request | Nothing that reaches a pull request |

**L3 is the only stage that decides.** L2 is convenience and fast feedback. L1
is a courtesy that saves a round trip. Any rule that matters lands in L3.

It decides only where the check is actually **required**, which is a setting on
the repository rather than anything this engine controls, and one that is a paid
feature on private repositories. A workflow that runs and reports without being
required looks identical to one that decides, and is not one. Confirm which you
have before describing a rule as enforced; see [`ADOPTING.md`](ADOPTING.md).

L1 is deliberately isolated under `adapters/`, one directory per assistant, so
an organisation using a different tool (or none) deletes that directory and
loses nothing else. The core is agent-agnostic.

## The load-bearing property

For a rule to mean anything under review, the gate must not read its rules from
the branch it is judging. Otherwise a branch can weaken the rule that judges
it, and the check becomes decorative.

> **The gate fetches the ratified rules. It never reads them from the branch
> under judgement.**

Editing a rule locally is therefore free and changes nothing about what CI
enforces. Rules become live only by being ratified in the instance repository,
through whatever review the organisation configures there. Edit freely, ratify
deliberately.

Stating that is not enough, since the one setting that breaks it is a setting an
adopter controls. So the workflow checks it: `scripts/rules-independence-check.mjs`
compares the commit the rules were read from against the commit under review and
refuses to run if they are the same. A check that cannot answer the question
exits with an error rather than a pass, because "could not tell" and "fine" must
never look alike.

## The gates

A gate is a capability, never a rule. `forbidden-patterns` knows how to reject
lines matching a pattern; it has no view on which patterns anyone should ban.
Indentation makes the point: "indent with tabs" and "indent with two spaces"
are the same capability pointed at opposite regexes, so neither belongs in the
engine.

| Gate | Asserts |
| --- | --- |
| `forbidden-chars` | No text may contain these code points |
| `forbidden-patterns` | No line may match these patterns |
| `required-patterns` | Every file in scope must contain a match |
| `cited-id-integrity` | Every rule citation in code names an id that exists |
| `locked-paths` | A change set does not touch locked paths |

`required-patterns` is not redundant: absence is not the negation of presence,
and no configuration of `forbidden-patterns` can express "some line must say X".

`cited-id-integrity` closes the loop back to the register. Mark the code that
implements a rule with a citation, and this catches the citation still claiming
a link after the rule has been superseded out of existence.

`locked-paths` does not make a file unchangeable. It makes changing it a
deliberate act rather than a side effect of a larger commit, and the
`--no-verify` escape hatch is intentional: a lock nobody can lift just gets
routed around invisibly. Additions are never blocked, because a file that does
not exist yet cannot be silently overwritten.

Configure them in your own repository and run:

```sh
node <engine>/scripts/run-gates.mjs --staged --config governance/gates.json
node <engine>/scripts/run-gates.mjs --range main...HEAD --config governance/gates.json
```

`--staged` is the commit-time question, "what am I about to commit".  `--range`
is the review-time one, "what does this change alter". Both produce a change
set, which `locked-paths` needs and a whole tree cannot provide: nothing is
staged in CI, so without a range that gate could never run at the only stage
that decides.

[`gates.example.json`](gates.example.json) is the template.
[`gates/README.md`](gates/README.md) is the contract for writing a new one.

**No gate ships a default.** Unconfigured, a gate does nothing and reports
nothing. That looks like a missing feature and is the opposite: a default is an
opinion, and an opinion in the engine is a rule that travelled where only
mechanism should.

Two things are errors rather than warnings, because both would otherwise leave
you believing a rule is enforced while nothing runs: **a config key naming a
gate that does not exist**, and **an unknown parameter inside a gate's config**.
A silently ignored key is this engine's own failure mode reproduced one level
down.

## The rule register

A register is an adopter's set of rule records: what they enforce, why, and by
what mechanism. It is layer 3, so it lives in their repository and never here.
[`register.example.md`](register.example.md) is the template and the format
reference, and `scripts/registry-check.mjs` validates it:

```sh
node scripts/registry-check.mjs --register governance/rules.md
```

Each rule carries a statement, a rationale, its kind (`hard` or `soft`), the
gate that enforces it, a status, a precedence, a scope, a provenance tag and a
lifecycle. The shape is defined once, in executable form, at the top of
`scripts/registry-check.mjs`; there is no separate schema file, because this
engine carries no dependencies and a schema nothing validates is decoration.

Two checks make the register worth more than a list:

**Status may not overstate enforcement.** A rule claiming `enforced` or
`partial` while naming a gate that does not exist fails validation. A register
that can award itself credit is worse than no register, because the claim now
looks audited. A `hard` rule with `Enforcement: none` and `Status: prose` is
legal: an aspiration labelled as one is honest, and it is the overclaim that
does damage.

**Supersede, never delete.** Changing a rule means marking it superseded and
pointing at its replacement, which must exist. The old record stays, so why a
decision changed remains readable.

The gate ids a rule may name are [derived from the files on
disk](gates/registry.mjs), never hand-listed, so an id cannot exist without a
gate. `gates/registry.test.mjs` closes the other half: every gate must export
the id its filename implies and have a proof beside it. A rule claiming
enforcement therefore names something that demonstrably works.

## The neutrality gate

`scripts/neutrality-check.mjs` blocks identifying content from entering a
repository that must not carry it. It is the mechanism behind this engine's own
portability claim, and it is the first thing that ran here: it landed before any
other content, so nothing has ever entered this repo ungated.

It is a capability you can point at your own repositories, and it is **the one
part of this engine that the reusable workflow does not run**. That is
deliberate, not an omission. Running it in CI would mean putting your token list
where the workflow can read it, and a list of names that must never appear is
precisely the file you least want decrypted into a runner. It also would not
reach a pull request from a fork, which is where secrets stop.

So this gate runs **where the names already are**: on the machines of the people
who hold them, at authoring, commit and push time, with `--history` as the audit
that answers "did anything ever get through". Those stages are listed below.
Nothing about it is enforced at the pull request boundary, and a rule relying on
it should say so rather than claim `enforced`.

Its banned-token list is **never inside this repository**, not even ignored. A
file of real names in the working tree is one `git add -f` or one lost ignore
rule away from a permanent public commit, and defending a hazard with an ignore
rule is weaker than not having the file there. The list resolves from outside
the tree, in this order:

1. `--tokens <path>`
2. `$GOVERNANCE_TOKENS`
3. `~/.config/engineering-governance/tokens`

`neutrality.tokens.example` is the tracked template and names nothing. Run
`sh scripts/setup.sh` to install the hooks and create the list. Keeping it out
of the tree also means it survives re-cloning this repo.

Matching ignores case, punctuation, spacing and camelCase boundaries, so one
token catches every spelling of itself, including inside URLs, email addresses
and source identifiers. See `scripts/neutrality-check.test.mjs` for the proof,
which demonstrates the failing cases rather than only the passing ones.

### Where it runs

| Stage | Command | Catches |
| --- | --- | --- |
| Authoring | see [`adapters/`](adapters/) | A slip as it is written, before staging |
| Commit | `--staged` | Added lines, human or machine |
| Push | `--history` | Anything committed with `--no-verify`, or before the list existed |
| Audit | `--history` | Whether anything **ever** leaked, across every commit |

`--history` matters more than it looks. It reads every commit and every commit
message, because history is permanent: deleting a name in a later commit does
not remove it from the repository. A clean working tree proves nothing on its
own.

### Configured versus unconfigured

The gate **fails closed when you invoke it**: no resolvable list is exit `2`,
not a pass. If you ask it to run, it runs or it errors.

The **hooks** treat exit `2` as "not configured", warn loudly, and continue.
That is deliberate. You can only leak identifiers you hold, so a contributor
with no list has nothing to leak and must not be blocked from working on the
engine. Warning loudly is what stops it becoming a gate that silently vanished.

### The one exemption

A **copyright notice** is exempt, wherever it appears. A licence has to name
its holder, so that name cannot be banned from the file that states it.

The exemption is not specific to any organisation. It applies to whoever holds
the copyright at the time, which includes an adopter who adds their own notice
for their modifications. An earlier holder's notice does not trip a later
adopter's gate in any case, since each organisation's token list names its own
business.

It is scoped as tightly as the job allows:

- It matches the notice **line**, not a whole file, so the remaining 200 lines
  of `LICENSE` are still scanned.
- The pattern requires a **year**, so an ordinary sentence beginning with the
  word "copyright" cannot be used as an escape hatch.
- It reveals **who owns the engine, never what they enforce**. No rule, client
  or convention can hide behind it.

## Adopting it

1. Create an instance repository, separate from anything it governs. It holds
   your rule register and your gate parameters, and nothing else. Public or
   private is your call, and the trade-off is set out in
   [`ADOPTING.md`](ADOPTING.md).
2. Configure review on the register path there. That review is what ratifies a
   rule; the engine has no opinion about who approves what.
3. In each repository you want governed, call
   [`.github/workflows/governance.yml`](.github/workflows/governance.yml) and
   make it a required status check. Making it required is what closes the
   obvious bypass: deleting the call leaves a required check permanently
   unfulfilled, so the pull request blocks rather than passing ungated.

[`ADOPTING.md`](ADOPTING.md) has the caller workflow, the inputs, and how the
required check is named.

Moving to a different organisation means taking this repo and writing a new
instance repo. None of the previous organisation's rules travel, which protects
both parties.

## Honest limits

State these wherever the model is described, including to anyone being
onboarded.

- **No gate judges meaning.** A rule can be followed to the letter and violated
  in substance. Semantic contradiction is not machine-checkable and nothing
  here claims to catch it.
- **Local is never enforced.** Anyone with write access can bypass any hook
  with `--no-verify` and edit any file in their checkout. Only the pull request
  boundary decides. The model is built on that admission rather than around it.
- **The gate is only as good as the register.** A rule nobody transcribed is a
  rule nobody enforces, and transcription is manual.
- **The neutrality gate matches tokens, not intent.** It catches a name you
  told it about. It cannot catch a description that identifies you without
  naming you, or a client you forgot to list.
- **A clone that never ran `setup.sh` has no hooks,** so nothing local fires on
  it. `--history` catches it afterwards, at the next push or audit. CI cannot
  cover this, because CI holding an adopter's list is exactly the coupling that
  would deadlock the engine. It is an accepted cost of standing alone.
- **Nothing backs up your token list.** It lives outside the repo on purpose,
  so no version control protects it. Keep a durable copy somewhere you control.

## Status

| Part | State |
| --- | --- |
| Neutrality gate, commit and push hooks, authoring adapter | Built |
| Rule register, validator, derived gate registry | Built |
| Five capability gates and the runner | Built |
| Reusable CI workflow, and the check that the rules are independent | Built, and run against real pull requests |

Nothing claims to be enforced until its mechanism is committed and green, and
that applies to this table as much as to a register.

The workflow has now been exercised end to end by throwaway caller and instance
repositories holding invented rules, which is what moved the row above off
"never run". What those runs establish:

- The engine checks itself out at the **commit** the workflow file came from,
  read from the `job` context, so the workflow and the scripts it calls cannot
  be different versions.
- All three checkouts resolve, and one token covering only the instance is
  enough when the engine is public.
- A pull request is scoped to `base...head`, which is what gives a gate of
  `inputKind: changes` a change set at the only stage that decides.
- Every configured gate fires on a violation and reports the path without
  echoing the offending text.
- A branch that supplies the rules judging it is **refused before any gate
  runs**, which is the property the whole model rests on.
- An instance that cannot be read fails the run rather than skipping quietly,
  and a run that has no diff says so instead of reporting a clean tree as if it
  had checked one.

One further limit is not ours to close. **A required status check is a paid
feature on private repositories**, so on a free plan the workflow can report on
a private repository but cannot block a merge there. The mechanism is complete;
whether it decides anything depends on the plan the repository sits on. See the
plan note in [`ADOPTING.md`](ADOPTING.md), and do not resolve it by making a
repository public.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE).
