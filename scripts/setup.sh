#!/bin/sh
# One-command setup for a fresh clone. From the repo root:
#   sh scripts/setup.sh
#
# A fresh clone has no hooks installed, so nothing local is running. This
# installs them and makes sure a token list resolves.
#
# The token list is created OUTSIDE this repository, deliberately. A file of
# real identifiers inside the working tree is one `git add -f` or one lost
# ignore rule away from a permanent public commit. Keeping it out also means it
# survives re-cloning this repo.

set -e

cd "$(dirname "$0")/.."

git config core.hooksPath .githooks
echo "hooks: core.hooksPath -> .githooks (pre-commit, pre-push)"

TOKENS="${GOVERNANCE_TOKENS:-$HOME/.config/engineering-governance/tokens}"

if [ -f "$TOKENS" ]; then
  echo "tokens: found at $TOKENS"
else
  mkdir -p "$(dirname "$TOKENS")"
  cp neutrality.tokens.example "$TOKENS"
  echo "tokens: created $TOKENS from the template"
  echo ""
  echo "  ACTION REQUIRED: it holds placeholders, so the gate is not yet"
  echo "  protecting anything real. Replace them with your own identifiers,"
  echo "  or restore your organisation's existing list over it."
  echo ""
  echo "  It is intentionally outside this repository. Keep a durable copy"
  echo "  somewhere you control, because nothing here backs it up."
fi

echo ""
echo "verifying..."
node scripts/neutrality-check.mjs --all
node --test "scripts/**/*.test.mjs" >/dev/null
echo "ok: gate runs and proofs pass"
