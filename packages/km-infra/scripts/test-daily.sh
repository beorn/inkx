#!/bin/bash
# Full daily test suite — runs everything including fuzz, strict, and slow tests.
# Exit on first failure. Prints a summary with timing at the end.
#
# Usage: bun run test:daily
# Expected runtime: 10-30 minutes (depends on FUZZ_REPEATS)
#
# Phases:
#   1. Typecheck (baseline guard)
#   2. Lint + format
#   3. Fast tests (default vitest project)
#   4. Slow tests
#   5. Vendor tests
#   6. Fuzz tests (randomized property testing)
#   7. SILVERY_STRICT terminal verification (xterm backend)


set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

TOTAL_START=$SECONDS
RESULTS=()
PHASE=0
TOTAL_PHASES=7

# Run a phase: name, command...
run_phase() {
  local name="$1"
  shift
  PHASE=$((PHASE + 1))

  echo ""
  echo "== Phase $PHASE/$TOTAL_PHASES: $name =="
  echo ""

  local start=$SECONDS
  "$@"
  local elapsed=$((SECONDS - start))

  RESULTS+=("  + $name (${elapsed}s)")
  echo ""
  echo "  -- $name passed (${elapsed}s) --"
}

# Trap to print summary even on failure
print_summary() {
  local exit_code=$?
  local total_elapsed=$((SECONDS - TOTAL_START))

  echo ""
  echo "======================================"

  if [ $exit_code -eq 0 ]; then
    echo "  ALL PHASES PASSED (${total_elapsed}s total)"
  else
    echo "  FAILED at phase $PHASE/$TOTAL_PHASES (${total_elapsed}s elapsed)"
  fi

  echo "======================================"

  for result in "${RESULTS[@]}"; do
    echo "$result"
  done

  if [ $exit_code -ne 0 ]; then
    echo "  x Phase $PHASE failed"
  fi

  echo ""

  # Write timestamp on success
  if [ $exit_code -eq 0 ]; then
    date +%s > /tmp/km-test-daily-last-run
    echo "Timestamp written to /tmp/km-test-daily-last-run"
  fi
}
trap print_summary EXIT

# Phase 1: Typecheck (baseline guard)
run_phase "Typecheck" bash packages/km-infra/scripts/typecheck/check.sh

# Phase 2: Lint + format (bun fix)
run_phase "Lint + Format" bun fix

# Phase 3: Fast tests (default vitest project)
run_phase "Fast Tests" bun vitest run

# Phase 4: Slow tests
run_phase "Slow Tests" bun vitest run --project slow

# Phase 5: Vendor tests
run_phase "Vendor Tests" bun vitest run --project vendor

# Phase 6: Fuzz tests
run_phase "Fuzz Tests" bun vitest run --project fuzz

# Phase 7: STRICT terminal verification (xterm backend)
run_phase "STRICT Terminal (xterm)" env SILVERY_STRICT_TERMINAL=vt100,xterm bun vitest run --project default --project slow
