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

if grep -q "Found .* and [1-9][0-9]* error" "$TMPFILE"; then
  exit 1
fi
