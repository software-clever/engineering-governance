# engineering-governance

An engine for making engineering rules enforceable rather than merely written.

It holds **mechanism only**. It contains no rules, no house style, no company
names and no opinions about how anyone should work. The business adopting it
supplies all of that from a separate private repository. That separation is
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

| Layer | Holds | Example | Where it lives |
| --- | --- | --- | --- |
| **1. Mechanism** | Registry schema, validator, workflow plumbing, hook installers, gate interface | "A hard rule naming an unregistered gate fails the build" | This repo |
| **2. Capability gates** | Parameterised checkers, shipped with no defaults | `forbidden-chars`, taking a codepoint list | This repo |
| **3. Rules and config** | The rule records, and the parameters they pass to gates | "R-1: no em dashes. Hard. `forbidden-chars` with `U+2014`" | Your private instance repo |

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

## The neutrality gate

`scripts/neutrality-check.mjs` blocks adopter-identifying content from entering
this repo, at commit time and in CI. It is the mechanism behind the portability
claim, and it is the first thing that ran here: it landed before any other
content, so nothing has ever entered this repo ungated.

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

1. Create a private instance repository. It holds your rule register and your
   gate parameters, and nothing else.
2. Configure review on the register path there. That review is what ratifies a
   rule; the engine has no opinion about who approves what.
3. In each repository you want governed, call the reusable workflow and make it
   a required status check. Making it required is what closes the obvious
   bypass: deleting the call leaves a required check permanently unfulfilled,
   so the pull request blocks rather than passing ungated.

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

Early. The neutrality gate and its proof exist; the register, the gates and the
workflows are being built on top of it. Nothing here claims to be enforced
until its mechanism is committed and green.

## Licence

Apache-2.0. See [`LICENSE`](LICENSE).
