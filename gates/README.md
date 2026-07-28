# Gates

A gate is a **capability**, not a rule. It knows how to check something; it has
no opinion about what should be checked. The opinion arrives as configuration
from the adopter, which is what lets one engine serve businesses with opposite
conventions.

Indentation is the clearest illustration, because both answers are defensible.
A project that indents with tabs and a project that indents with two spaces need
the *same* capability, "no line may match this pattern", pointed at opposite
regexes. Ship a gate called `no-tabs` and you have chosen a side in the engine:
the other project cannot use it, and the filename alone announces what you
believe. Ship `forbidden-patterns` and both projects configure it and move on.

## What the capabilities are

Two directions, because one cannot express the other.

| Gate | Asserts | Example use |
| --- | --- | --- |
| `forbidden-chars` | No text may contain these code points | Ban a control character, or a look-alike Unicode space |
| `forbidden-patterns` | No line may match these patterns | Indent with tabs (forbid a leading space); ban a word |
| `required-patterns` | Every file in scope must contain a match | A licence header on every source file |
| `cited-id-integrity` | Every rule citation names an id that exists | A comment marking the code that enforces a rule |
| `locked-paths` | A change set does not touch locked paths | Making a change to a crown-jewel file deliberate |

`required-patterns` exists because absence is not the negation of presence. "No
line may say X" and "some line must say X" are different questions, and no
configuration of the first answers the second.

## The contract

Each gate is a module at `gates/<id>.gate.mjs` exporting:

| Export | Meaning |
| --- | --- |
| `id` | Must equal the filename's id. Enforced by `registry.test.mjs`. |
| `describe` | One line, for listings and error output. |
| `inputKind` | `text` or `changes`. What `evaluate` is handed. |
| `configure(params)` | Validate and normalise config. Throws on bad input. Returns the normalised form. |
| `evaluate(input, config)` | Return an array of violations. |

`evaluate` is **pure and deterministic**: same input, same violations. No file
reads, no network, no clock, no randomness, and never a language model. A gate
that consults anything outside its arguments cannot be reasoned about, and a
gate whose verdict can vary is not a gate.

`configure` may read a file it is explicitly pointed at, because that happens
once at setup and keeps `evaluate` pure. `cited-id-integrity` reads a register
this way. If the file is missing it **throws**, rather than proceeding with
nothing to check: a gate that passes because it could not load its data is the
worst outcome available to it.

Input by kind:

- `text`: `{ text, path }`, the whole file content and its path.
- `changes`: `{ changes }`, a list of `{ path, status }` from a diff, where
  status is a git status letter (`A`, `M`, `D`, `R`).

`changes` exists because "which paths does this change touch" has no answer
when looking at a whole tree. A gate of that kind is **skipped with a warning**
outside a change set rather than passing quietly, since a gate that silently
contributes nothing still leaves a green tick that reads as protection.

A violation is `{ gateId, message, path?, line? }`. **Never put the offending
text in `message`.** Findings are surfaced in logs and pull requests, and
echoing the thing you are trying to keep out defeats the point.

## No defaults, ever

A gate ships with **no configuration**. Unconfigured, it does nothing and
reports nothing.

This looks like a missing feature and is the opposite. A default is an opinion,
and an opinion in the engine is a rule that travelled where only mechanism
should. `configure({})` returning an inert gate is correct behaviour, and every
gate proves it.

The consequence is that a gate is only ever as good as the adopter's config,
and a rule register is what makes that config deliberate rather than incidental.

## Adding one

1. Write `gates/<id>.gate.mjs` following the contract.
2. Write its proof at `gates/<id>.gate.test.mjs`, covering what it **rejects**,
   what it **allows**, and that it is **inert when unconfigured**.
3. That is all. The id list is derived from disk, so nothing needs registering
   by hand, and `registry.test.mjs` fails if the id and filename disagree or
   the proof is missing.

Once both files exist, a rule in a register may name that gate id and claim
`Status: enforced`. Until then `registry-check.mjs` rejects the claim.

## Naming

Name a gate for **what it checks**, never for the rule it happens to serve. The
bad names below are not hypothetical mistakes; they are the natural thing to
call a gate when you build it to serve one rule you already hold.

| Good | Bad | Why the bad one fails |
| --- | --- | --- |
| `forbidden-patterns` | `no-tabs` | Picks a side, and is far narrower than the capability |
| `required-patterns` | `licence-header` | Names one use of the check rather than the check |
| `cited-id-integrity` | `ticket-ref-check` | Names a local convention rather than what is verified |

A useful test: if the filename would look out of place in a competitor's
repository, it is carrying an opinion that should have been configuration.
