# Adapters

Layer 1 is authoring-time enforcement: run a gate the moment a file is written,
so a violation surfaces before it is ever staged. Which assistant is doing the
writing is the only part of that which varies, so it is the only part that
lives here.

**The gates are not assistant-specific.** Everything in `scripts/` takes a file
path and knows nothing about any tool:

```sh
node scripts/neutrality-check.mjs path/to/file.md
```

Any assistant, editor or file watcher that can run a shell command after an
edit can call that directly and needs **no adapter at all**. An adapter exists
only for tools whose hook mechanism hands you a structured payload instead.

## The adapter contract

An adapter is a shim, and a short one. It must:

1. Read the tool's hook payload (usually JSON on stdin).
2. Extract the path of the file just written. If there is not one, exit `0`.
3. Run `scripts/neutrality-check.mjs <path>` (and any other configured gate).
4. Translate the result into whatever the tool understands as "tell the model".

Two details matter, and both are easy to get wrong:

- **Exit code 2 from a gate means "not configured", not "clean".** It is a
  valid state for anyone holding no adopter data. An adapter should treat it as
  a pass and stay quiet, because the commit and push hooks already warn once
  per commit rather than once per keystroke.
- **Never echo the matched text.** The gates deliberately report a location
  and not the offending string, so that findings can be surfaced without
  repeating the thing being kept out.

## What ships here

| Adapter | Status |
| --- | --- |
| `claude-code/` | Tested |

Only adapters that have actually been run are included. An untested adapter
would claim enforcement that has not been demonstrated, which is the failure
mode this whole project exists to prevent. Adding one for another tool is
welcome; add it once it has been run, not before.

## Honest limits

- **Not every tool can do this.** Some assistants have no post-write hook. For
  those, layer 1 simply does not exist, and that is survivable: it is the
  weakest of the three stages by design.
- **Layer 1 only ever sees one author.** It catches what *that* assistant
  writes, never what a human types, what a different tool produces, or what
  arrives through a merge. It is a courtesy that saves a round trip.
- **Layer 2 and layer 3 are the layers that decide.** Any rule that matters
  lands there. Deleting this entire directory weakens nothing that is
  load-bearing.
