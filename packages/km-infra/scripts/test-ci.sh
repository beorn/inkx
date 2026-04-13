#!/bin/bash
# Comprehensive CI test suite — runs all checks in sequence.
# Exit on first failure. Prints a summary with timing at the end.
#
# Usage: bun run test:ci
# Expected runtime: 3-5 minutes
#
# Writes last-run timestamp to /tmp/km-test-ci-last-run for the
# pre-push hook reminder system.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

TOTAL_START=$SECONDS
RESULTS=()
PHASE=0
TOTAL_PHASES=5

# Run a phase: name, command...
run_phase() {
  local name="$1"
  shift
  PHASE=$((PHASE + 1))

  echo ""
  echo "══ Phase $PHASE/$TOTAL_PHASES: $name ══"
  echo ""

  local start=$SECONDS
  "$@"
  local elapsed=$((SECONDS - start))

  RESULTS+=("  ✓ $name (${elapsed}s)")
  echo ""
  echo "  ── $name passed (${elapsed}s) ──"
}

# Trap to print summary even on failure
print_summary() {
  local exit_code=$?
  local total_elapsed=$((SECONDS - TOTAL_START))

  echo ""
  echo "══════════════════════════════════════"

  if [ $exit_code -eq 0 ]; then
    echo "  ALL PHASES PASSED (${total_elapsed}s total)"
  else
    echo "  FAILED at phase $PHASE/$TOTAL_PHASES (${total_elapsed}s elapsed)"
  fi

  echo "══════════════════════════════════════"

  for result in "${RESULTS[@]}"; do
    echo "$result"
  done

  if [ $exit_code -ne 0 ]; then
    echo "  ✗ Phase $PHASE failed"
  fi

  echo ""

  # Write timestamp on success
  if [ $exit_code -eq 0 ]; then
    date +%s > /tmp/km-test-ci-last-run
    echo "Timestamp written to /tmp/km-test-ci-last-run"
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

# Fuzz tests are NOT included in test:ci — they're too slow for a quick feedback loop.
# Run fuzz separately: FUZZ=1 FUZZ_REPEATS=100 bun vitest run
# The pre-push hook reminds you to run fuzz periodically.
