# Claude Code adapter

Runs the gates on each file Claude Code writes, before it is staged. See
[`../README.md`](../README.md) for the adapter contract and the honest limits
of layer 1.

## Install

Copy the settings fragment into the repository's `.claude/settings.json`, or
merge it into an existing one:

```sh
mkdir -p .claude
cp adapters/claude-code/settings.fragment.json .claude/settings.json
```

If `.claude/settings.json` already exists, merge the `PostToolUse` entry rather
than overwriting the file.

## Verify it fires

Have Claude write a file containing an identifier from your token list, and the
finding should appear immediately. A hook that has only ever been observed
staying quiet has not been observed at all.

If nothing happens, check in order:

- `node adapters/claude-code/post-write-check.mjs` exists and `node` is on PATH.
- A token list resolves. Run `node scripts/neutrality-check.mjs --all`; exit
  code 2 means no list is configured, and the adapter stays deliberately silent
  in that state.
- Claude Code has picked up `.claude/settings.json`, which may need the session
  restarting.

## Why the hook is quiet when unconfigured

Exit code 2 from a gate means "no token list", not "clean". Someone holding no
adopter data cannot leak any, so blocking or nagging them on every write would
be noise. The commit and push hooks warn once per commit instead, which is the
right frequency for that message.
