# Adopting the engine

Wiring layer 3 into a repository you want governed. Read [`README.md`](README.md)
first for what the engine is and why it is split the way it is.

Placeholders below are written as `<your-org>` and `<your-instance>`. Nothing in
this repository names an organisation, including its own examples.

## 1. Create the instance repository

The engine holds mechanism. Everything particular to you lives in a repository
of your own, usually private:

```
<your-instance>/
  rules.md      your rule register, started from register.example.md
  gates.json    your gate configuration, started from gates.example.json
```

Both paths are configurable; these are the defaults.

Then configure review on the register path there. **That review is the
ratification.** The engine has no opinion about who approves what, and it never
asks: it reads whatever the ratified ref holds and enforces that.

## 2. Call the workflow

In each repository you want governed, add `.github/workflows/governance.yml`:

```yaml
name: Governance

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  governance:
    uses: <your-org>/engineering-governance/.github/workflows/governance.yml@main
    with:
      instance-repo: <your-org>/<your-instance>
    secrets:
      governance_token: ${{ secrets.GOVERNANCE_TOKEN }}
```

| Input | Default | Notes |
| --- | --- | --- |
| `instance-repo` | required | Where your register and gate config live. |
| `instance-ref` | `main` | The **ratified** ref. See the warning below. |
| `register-path` | `rules.md` | Within the instance repository. |
| `config-path` | `gates.json` | Within the instance repository. |
| `node-version` | `22` | Node used to run the engine. |

`governance_token` is needed only when the instance repository, or the engine,
is private. Omit it when both are public: the calling repository's own token
already reads public repositories. It needs read access to those repositories
and nothing else.

**Never point `instance-ref` at the change under review.** A branch that
supplies its own rules can weaken a rule and break it in the same pull request
and pass both. The workflow refuses to run when it detects this, but the setting
is yours and the check only catches the case it can see.

### What version you are pinned to

`@main` takes engine changes as they land. A tag or a commit takes them when you
choose. Both are defensible and the engine has no preference, but pin
deliberately: whichever you choose is the revision that will be judging your
code.

The workflow checks out the engine at the revision the `uses:` line resolved to,
so the workflow and the scripts it runs are always the same version. There is no
separate ref to keep in step.

## 3. Make the check required

This is the step that matters, and skipping it leaves everything above
decorative.

In branch protection, or a ruleset, on the branch you protect, add the workflow
as a **required status check**.

The check name is the caller's job id, then the job name inside the reusable
workflow, joined with a space, slash, space. With the snippet above that is:

```
governance / Governance
```

Read it off the checks list on a real pull request rather than typing it from
memory. A required check whose name does not match anything that ever reports
blocks every pull request permanently, and the failure gives no hint why.

### Why "required" is the load-bearing word

Without it, deleting the `uses:` line deletes the gate. The pull request that
removes it runs no check and merges green, and every pull request after it is
ungated too. Nothing announces this: the absence of a check looks exactly like a
check that passed.

With it, deleting the `uses:` line leaves a required check that never reports.
The pull request cannot merge. Removing the gate therefore becomes a deliberate
act at the branch protection settings, visible and attributable, rather than a
one line diff nobody notices.

## What runs

In order, and any failure fails the check:

1. **The register is validated.** A rule claiming `enforced` or `partial` while
   naming a gate that does not exist fails here, so a register cannot award
   itself credit.
2. **The gates run** over what the change touched, using your configuration.
   On a pull request that is the diff against the merge base; on a push it is
   the diff since the previous commit; otherwise it is the whole tree.

The scope is printed on every run. A gate that needs a change set says so when
it does not get one, rather than passing quietly, because a green tick looks the
same whether a gate ran or was skipped.

## Limits worth stating to whoever you onboard

- **Anyone who can change branch protection can remove the requirement.** This
  is governance, not security. It makes bypassing deliberate and visible; it
  does not make it impossible.
- **The gate is only as good as the register**, and transcribing a rule into it
  is manual.
- **No gate judges meaning.** A rule can be followed to the letter and violated
  in substance.
- **Local hooks are convenience.** `--no-verify` skips them and a fresh clone
  has none. Only the pull request boundary decides, which is why the required
  check is step 3 and not an optional extra.
