# Claude notes for engineering-governance

Read [`README.md`](README.md) first for the doctrine. This file is the working
brief: what may enter this repo, what may not, and why the answer is stricter
than it looks.

## The one rule that overrides everything else

**Nothing entering this repository may identify the business using it.** No
company name, client name, person, product, codename, domain, registration
number or house convention. Not in code, comments, documentation, test
fixtures, commit messages or branch names.

This is not tidiness. The engine's only claim is that it is portable between
organisations, and a single adopter-specific string breaks that claim for
everyone. `scripts/neutrality-check.mjs` enforces it at commit and in CI, and
it fails closed.

If a change genuinely needs an adopter's name to make sense, the change belongs
in that adopter's own instance repository, not here. There is no exception
to reach for. The single copyright-notice exemption is described in the README
and is not a general escape hatch.

## Four settled constraints

Decided, not open. A session that re-derives these wastes its time and usually
arrives somewhere worse, because each one exists to close a hole that looked
harmless from inside a single change.

**1. This engine is intended to be public.** Never design anything that depends
on it being private, and never put anything in it that could not be published.
Publication is a question of when, not whether.

**2. An instance repository is always a *separate* repository from the subject,
read at a ratified ref.** Write access to that ref is the ratification boundary.
Its **visibility is the adopter's choice**, and the engine must work with either
and require neither.

The load-bearing property is separation, not privacy. What
`scripts/rules-independence-check.mjs` defends is that a branch cannot supply
the rules that judge it, and that breaks when the instance is the same
repository as the subject, or sits on a ref a contributor controls. A public
instance that is separate and protected preserves the property completely.

**3. A subject repository's visibility is never changed to suit the engine or an
instance.** The engine fits the repositories an organisation already has. If a
property can only be demonstrated by making a subject public, it is not
demonstrated.

**4. No property is ever proven against a real instance repository.** Proofs use
purpose-built throwaway repositories holding invented rules. A real instance
holds an organisation's actual governance data, and borrowing it for a
demonstration exposes that data to prove something a fixture proves equally
well.

### What follows from them

Rule 3 forces rule 1. A public caller can only call a reusable workflow in a
public repository, so if any governed repository is public, and its visibility
may not be changed to suit us, this engine has to be public.

Rule 2 makes instance visibility a documented trade-off rather than a rule. See
the table in [`ADOPTING.md`](ADOPTING.md): a private instance needs a token and
fails closed on fork pull requests; a public instance needs no credential but
publishes your `locked-paths` and `forbidden-patterns`, which is a reasonable
trade for an open project and reconnaissance for a closed one.

## Why this repo sits outside any parent workspace

It lives at the filesystem root alongside other repos, deliberately **not**
nested inside an organisation's umbrella or multi-root workspace.

Nesting it would make it inherit that organisation's own `CLAUDE.md`, so every
session here would load their commercial material, their client list and their
house rules. The neutrality claim would then be untestable, because the context
would be contaminated even when the files were clean.

**Do not move this repo under an umbrella, however tidy that looks.** Having
nothing above it is the honest test that it stands alone.

## The layer split, and where a change belongs

Before writing anything, decide which layer it is. Getting this wrong is the
main way the engine stops being portable.

| Layer | Belongs here | Example |
| --- | :--: | --- |
| 1. Mechanism: schema, validator, plumbing, interfaces | yes | "a hard rule naming an unregistered gate fails the build" |
| 2. Capability gates: parameterised checkers | yes | `forbidden-chars`, taking a codepoint list |
| 3. Rules and gate parameters | **no** | "no em dashes", and the codepoint that encodes it |

The test for layer 2: **would a business with opposite conventions still want
this file unmodified?** If not, an opinion has leaked into it.

Two consequences that are easy to get wrong:

- **Name gates for what they check, never for the rule they happen to serve.**
  `forbidden-chars`, not `em-dash`. A filename can leak a rule on its own.
- **Ship no defaults.** A gate with a default parameter is a leaked opinion. An
  unconfigured gate correctly does nothing.

## Adding a gate

Read [`gates/README.md`](gates/README.md) for the full contract. The short
version:

A gate lives at `gates/<id>.gate.mjs` and must export `id` matching its
filename, with its proof beside it at `gates/<id>.gate.test.mjs`. Both
couplings are enforced by `gates/registry.test.mjs`, and the id list is derived
from disk rather than written down, so an id cannot exist without a gate and a
gate cannot exist without a test.

That chain is what lets a rule claim `Status: enforced`: the validator only
accepts a gate id that resolves to something with a passing proof.

`evaluate` must be pure and deterministic: no file reads, no network, no clock,
no randomness, never a model. A gate whose verdict can vary is not a gate.

Three things every gate proves, not just the happy path:

- what it **rejects**,
- what it **allows**,
- that it is **inert when unconfigured**.

The last one is the portability property. A gate that quietly acquires a
default has smuggled an opinion into the engine.

## The engine never depends on adopter data

Dependencies point **from** the adopter **to** the engine, never the reverse.
If the build, the tests or CI needed a rule register or a token list, the engine
could not be built until an adopter existed, which is a deadlock. Writing the
engine and using it are different jobs.

Practical consequence: **never add a secret or an adopter config file to CI.**
If a check seems to need one, it belongs on the adopter's side, not here.

## Working commands

```sh
sh scripts/setup.sh                  # install hooks + create the token list, once per clone
node --test "**/*.test.mjs"          # all proofs (quote it: `--test <dir>` fails)
node scripts/neutrality-check.mjs --staged    # what pre-commit runs
node scripts/neutrality-check.mjs --history   # what pre-push runs; audits every commit
node scripts/neutrality-check.mjs --all       # working tree only
node scripts/registry-check.mjs --register register.example.md   # validate a register
node scripts/run-gates.mjs --staged --config <adopter-config>    # run configured gates (L2)
node scripts/run-gates.mjs --range main...HEAD --config <cfg>    # the same, over a diff (L3)
node scripts/rules-independence-check.mjs --rules <dir> --not <commit>
```

`--staged` and `--range` are the two ways to get a change set, and gates of
`inputKind: changes` need one. Nothing is staged in CI, which is why `--range`
exists.

The token list lives **outside this repo**, at `~/.config/engineering-governance/tokens`
by default (override with `--tokens` or `$GOVERNANCE_TOKENS`). Never create one
inside the tree, even ignored: a file of real names here is one `git add -f`
from a permanent public commit.

**Nor inside an instance repository.** The same argument applies there with more
force, because an instance may be public (constraint 2), and a tracked list of
real identifiers in a public repository publishes exactly what the gate exists
to keep out. Keeping the list out of every repository is what leaves instance
visibility free to be a choice.

Exit `2` means "no list configured", not "clean". The hooks treat it as a
warning and continue, because someone holding no adopter data cannot leak any
and must not be blocked. Invoking the gate directly still fails closed.

## Conventions

- **Zero runtime dependencies.** Node built-ins and plain shell only. Anything
  adopting this engine may have no package manager, no lockfile and no build
  step, and it must still work. This also keeps the supply-chain surface at
  nothing.
- **Test the failing case.** A gate observed only passing has not been
  observed. Every gate proves what it blocks, not just that it stays quiet.
- **Comments record WHY, not WHAT.** A comment restating the code earns
  nothing. Record why a non-obvious choice was made, at the time.
- **Nothing claims `enforced` without a mechanism.** Prose describing an
  intention is fine, as long as it says that is what it is.
- **UK English in documentation.** Code identifiers follow ordinary JavaScript
  convention.

## Every commit is final

A repository's history cannot be recalled once it has left the machine.
Unreachable commits stay retrievable by SHA after a force-push, and CI run
records survive independently of the branch. So treat each commit as permanent:

- **Run `--history` before pushing.** The pre-push hook does it for you. It
  reads every commit and every commit message, because a clean working tree
  proves nothing on its own.
- **If something does get through, rewrite the offending commits.** Adding a
  commit that removes the text does not remove it.

## What NOT to do

- Don't add an adopter's name, client, product or convention. See above.
- Don't add a secret or adopter config to CI; it deadlocks the engine.
- Don't create a token list inside the tree, ignored or otherwise.
- Don't name a gate after the rule it serves, or give it a default parameter.
- Don't move this repo under an organisation's umbrella.
- Don't add a runtime dependency to save a few lines.
- Don't claim a rule is enforced before its gate is committed and green.
- Don't weaken the neutrality gate to make a commit pass. If it fires, the
  content is in the wrong repo; that is the gate working.
