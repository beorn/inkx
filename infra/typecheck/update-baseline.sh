#!/bin/bash
# Regenerate the typecheck baseline from current tsc output.
# Run this after fixing type errors to lock in the improvements.
#
# Baseline format: "COUNT filepath" (sorted by filepath)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASELINE="$SCRIPT_DIR/baseline.txt"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

# Always use local tsc (node_modules/.bin) for consistent results
TSC="$REPO_ROOT/node_modules/.bin/tsc"
TSC_OUTPUT=$(NODE_OPTIONS='--max-old-space-size=8192' "$TSC" --noEmit 2>&1 || true)

echo "$TSC_OUTPUT" \
  | grep 'error TS' \
  | sed 's/(.*//' \
  | sort \
  | uniq -c \
  | sed 's/^ *//' \
  > "$BASELINE" || true  # 0 errors = grep exits 1, which is fine

TOTAL=$(awk '{sum += $1} END {print sum+0}' "$BASELINE")
UNIQUE=$(wc -l < "$BASELINE" | tr -d ' ')
echo "typecheck baseline updated: $TOTAL errors across $UNIQUE files"
