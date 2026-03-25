#!/bin/bash
# Type-check guard: catches NEW type errors without failing on known baseline errors.
#
# How it works:
#   1. Runs tsc --noEmit and counts errors per file
#   2. Compares against baseline.txt (error counts per file)
#   3. Fails if any file has MORE errors than the baseline allows
#   4. New files with errors also fail
#
# Uses file-level counting because tsc error codes can vary between runs
# (e.g., TS2322 vs TS2741 for the same type mismatch) depending on
# compilation order and CPU pressure.
#
# Updating the baseline (after fixing type errors):
#   bun run typecheck:update
#
# Baseline format: "COUNT filepath" (sorted by filepath)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASELINE="$SCRIPT_DIR/baseline.txt"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if [ ! -f "$BASELINE" ]; then
  echo "ERROR: No typecheck baseline found at $BASELINE"
  echo "  Run: bun run typecheck:update"
  exit 1
fi

# Run tsc, extract error counts per file
CURRENT=$(mktemp)
trap 'rm -f "$CURRENT"' EXIT

# Always use local tsc (node_modules/.bin) for consistent results.
# A global tsc may be a different version and produce different errors.
TSC="$REPO_ROOT/node_modules/.bin/tsc"
TSC_OUTPUT=$(NODE_OPTIONS='--max-old-space-size=8192' "$TSC" --noEmit 2>&1 || true)

echo "$TSC_OUTPUT" \
  | grep 'error TS' \
  | sed 's/(.*//' \
  | sort \
  | uniq -c \
  | sed 's/^ *//' \
  > "$CURRENT" || true  # 0 errors = grep exits 1, which is fine

CURRENT_TOTAL=$(echo "$TSC_OUTPUT" | grep -c 'error TS' || true)
CURRENT_TOTAL=${CURRENT_TOTAL:-0}
BASELINE_TOTAL=$(awk '{sum += $1} END {print sum+0}' "$BASELINE")
BASELINE_TOTAL=${BASELINE_TOTAL:-0}

# Compare: for each file in current output, check if it exceeds baseline
FAILED=0
NEW_ERRORS=""

while IFS= read -r line; do
  COUNT=$(echo "$line" | awk '{print $1}')
  FILEPATH=$(echo "$line" | cut -d' ' -f2-)

  # Look up this file in the baseline
  BASELINE_COUNT=$(grep -F " $FILEPATH" "$BASELINE" | awk '{print $1}' || echo "0")
  if [ -z "$BASELINE_COUNT" ]; then
    BASELINE_COUNT=0
  fi

  if [ "$COUNT" -gt "$BASELINE_COUNT" ]; then
    DIFF=$((COUNT - BASELINE_COUNT))
    FAILED=$((FAILED + DIFF))
    if [ "$BASELINE_COUNT" -eq 0 ]; then
      NEW_ERRORS="${NEW_ERRORS}  NEW: ${FILEPATH} (${COUNT} error(s))\n"
    else
      NEW_ERRORS="${NEW_ERRORS}  INCREASED: ${FILEPATH} (${BASELINE_COUNT} -> ${COUNT})\n"
    fi
  fi
done < "$CURRENT"

if [ "$FAILED" -gt 0 ]; then
  echo "TYPECHECK FAILED: $FAILED new type error(s) in files beyond baseline"
  echo ""
  echo -e "$NEW_ERRORS"
  echo "Fix these type errors, or if they are intentional, update the baseline:"
  echo "  bun run typecheck:update"
  exit 1
fi

FIXED=$(( ${BASELINE_TOTAL:-0} - ${CURRENT_TOTAL:-0} ))
if [ "${FIXED:-0}" -gt 0 ] && [ "${BASELINE_TOTAL:-0}" -gt 0 ]; then
  echo "typecheck: OK ($CURRENT_TOTAL errors, ~$FIXED fixed since baseline)"
  echo "  Update baseline to lock in fixes: bun run typecheck:update"
else
  echo "typecheck: OK ($CURRENT_TOTAL errors, matching baseline)"
fi
