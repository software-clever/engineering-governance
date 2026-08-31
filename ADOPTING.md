# Adopting the engine

Wiring layer 3 into a repository you want governed. Read [`README.md`](README.md)
first for what the engine is and why it is split the way it is.

Placeholders below are written as `<your-org>` and `<your-instance>`. Nothing in
this repository names an organisation, including its own examples.

## 1. Create the instance repository

The engine holds mechanism. Everything particular to you lives in a repository
of your own:

```
<your-instance>/
  rules.md      your rule register, started from register.example.md
  gates.json    your gate configuration, started from gates.example.json
```

Both paths are configurable; these are the defaults.

Then configure review on the register path there. **That review is the
ratification.** The engine has no opinion about who approves what, and it never
asks: it reads whatever the ratified ref holds and enforces that.

It has to be a **separate repository from the ones you are governing**, and it
has to be read at a ref whose write access you control. That is what stops a
branch supplying the rules that judge it. Everything else about it, including
whether it is public, is yours.

### Choosing its visibility

Both work, the engine requires neither, and the choice has consequences worth
making deliberately.

| Instance | Token | Fork pull requests on a public governed repo | What it costs |
| --- | --- | --- | --- |
| **Private** | `governance_token` required | **Fail closed.** GitHub does not pass secrets to a workflow triggered from a fork, so the instance cannot be checked out and the job fails. | Nothing |
| **Public** | None needed | Work normally | Publishes your `locked-paths`, which names your crown-jewel files, and your `forbidden-patterns`, which shows what you are guarding against |

Decide on **what you are putting in the register**, not on what kind of
organisation you are. For an open project a public instance is usually right:
the register becomes a contribution guide with teeth, and contributors can read
the rules that will judge them before they write anything. For a closed one, a
published gate configuration is a map of what you consider valuable.

Do not reach for `pull_request_target` to work around the fork case. It runs the
base branch's workflow against the fork's code, which hands the change under
review the thing this design exists to keep away from it.

**Your banned-token list, if you use the neutrality gate, belongs in neither
repository.** It lives outside version control entirely; see
`scripts/neutrality-check.mjs`. A tracked list of real identifiers is one
`git add -f` from being permanent, and in a public instance it would publish
precisely what the gate exists to keep out.

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

### If you keep your own copy of the engine

You will usually hold the engine in your own organisation rather than calling
someone else's. Two settings decide whether that works, and both fail in ways
that give no hint at the call site.

**Its visibility limits which repositories can call it.** GitHub's rule, not
this engine's:

| Repository being governed | Engine repositories it can call |
| --- | --- |
| `private` | `private` and `public` |
| `public` | `public` only |

So a private engine copy silently excludes every public repository you own from
being governed. If any of them is public, your copy has to be public too. Do not
solve this by changing the governed repository's visibility: that changes what
the world can see in order to satisfy a build, which is a bad trade in every
direction.

**A private engine copy also needs its access policy opened**, or nothing can
call it whatever else you configure. In its Actions settings, set Access to
allow repositories in your organisation:

```sh
gh api -X PUT repos/<your-org>/<engine-copy>/actions/permissions/access \
  -f access_level=organization
```

The default is `none`, meaning only that repository itself may use its
workflows. A caller hitting this fails at the `uses:` line before any step runs.

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

### Check your plan supports this, before relying on it

Required status checks are a paid feature on private repositories. GitHub's
gating, quoted from its documentation:

> Rulesets are available in public repositories with GitHub Free and GitHub Free
> for organizations, and in public and private repositories with GitHub Pro,
> GitHub Team, and GitHub Enterprise Cloud.

Protected branches are gated identically. So on a free plan with **private**
repositories, this step is unavailable, and everything above it runs and reports
but **cannot block a merge**.

That is a legitimate place to be, and it is only dangerous if you misdescribe
it. If it applies to you, record the enforcement stage honestly in your register
rather than marking rules `enforced` on the strength of a check that reports
into the void. An overclaimed guardrail is worse than a missing one, which is
the argument this whole engine rests on. The remedy is a plan that supports
rulesets on private repositories; it is not making a repository public to
qualify.

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
- **A private instance cannot govern fork pull requests.** Secrets do not reach
  a workflow triggered from a fork, so the instance checkout fails and the job
  fails with it. It fails closed rather than passing quietly, but if you take
  outside contributions, choose a public instance. See step 1.
