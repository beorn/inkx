#!/bin/bash
# Runs test:fast = typecheck baseline guard + vitest.
# Typecheck runs first (sequential, ~10s) because running alongside vitest
# causes tsc non-determinism due to CPU pressure affecting type inference.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
THRESHOLD=${TEST_FAST_THRESHOLD:-40}

cd "$REPO_ROOT"

# Phase 1: Type-check baseline guard (~10s)
bash packages/km-infra/scripts/typecheck/check.sh
TC_EXIT=$?

if [ "$TC_EXIT" -ne 0 ]; then
  exit 1
fi

# Phase 2: Vitest (with timing guard)
START=$SECONDS
bun vitest run "$@"
VITEST_EXIT=$?
ELAPSED=$((SECONDS - START))

if [ $ELAPSED -gt $THRESHOLD ]; then
  echo ""
  echo "WARNING: test:fast took ${ELAPSED}s (threshold: ${THRESHOLD}s)"
  echo "  Common causes: infinite loops, stale vitest processes, CPU contention"
fi

exit $VITEST_EXIT
