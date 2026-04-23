#!/usr/bin/env bash
# Wrapper for oxlint that works around stdout-blocking panic
# (oxc_diagnostics WouldBlock bug with high warning volume)
# Strategy: write output to temp file, then display it

set -euo pipefail

# Ensure node_modules/.bin is in PATH (bun scripts do this automatically)
export PATH="node_modules/.bin:$PATH"
OXLINT_CONFIG="packages/km-infra/oxlint/config.json"
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

find apps packages vendor \
  -path '*/node_modules' -prune -o \
  -path '*/dist' -prune -o \
  \( -name '*.ts' -o -name '*.tsx' \) -print \
  | xargs oxlint -c "$OXLINT_CONFIG" --type-aware "$@" > "$TMPFILE" 2>&1 || true

cat "$TMPFILE"

# In --fix mode, always succeed (fixed what we could)
# In check mode, fail on errors (not warnings)
for arg in "$@"; do
  if [[ "$arg" == "--fix" ]]; then
    exit 0
  fi
done

# xargs may split the file list into multiple oxlint invocations, each
# emitting its own "Found N warnings and M errors." summary. Aggregate
# counts across ALL summary lines so we report the true totals and exit
# correctly even when only the first chunk had errors.
awk '
  /^Found [0-9]+ warnings? and [0-9]+ errors?\.$/ {
    # "Found 40 warnings and 1 error."
    w += $2
    e += $5
    n++
  }
  END {
    if (n > 1) {
      printf "\nAggregate across %d oxlint chunks: %d warnings, %d errors.\n", n, w, e
    }
    exit (e > 0) ? 1 : 0
  }
' "$TMPFILE"
