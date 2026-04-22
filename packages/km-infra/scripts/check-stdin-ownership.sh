#!/usr/bin/env bash
# Block new stdin-race offenders. Existing call sites are tracked by
# baseline; the count can only go DOWN.
#
# Why this script exists: on 2026-04-22 we lost half a session debugging a
# race between `probeColors` and the term-provider's events() generator.
# Both reached into `process.stdin.setRawMode` and used the "snapshot
# wasRaw, restore in finally" protocol. Under async, the restore silently
# undid the term-provider's setRawMode(true), killing input. We shipped
# four tenant-side patches, then made the structural fix: silvery's
# term-provider becomes the SOLE owner of stdin (mirroring OutputGuard
# for stdout). See bead km-silvery.input-owner.
#
# The lint rule is what makes the structural fix permanent. Writing the
# anti-pattern is now a CI error, not a documentation footnote. Don't
# rely on contributors remembering — the build does it for them.
#
# Strategy: baseline guard. Today's count of pre-existing offenders is
# burned in below. New code that introduces an offender bumps the count
# and fails CI. As km-silvery.input-owner Phase 2 migrates each call
# site to InputOwner.probe(), the count drops and the baseline is
# lowered. Net effect: monotonic progress toward zero, no CI churn now.
#
# To LOWER the baseline: when you migrate call sites, run this script,
# observe the new count, update the BASELINE_* constants below, commit.
#
# Files exempt entirely (the InputOwner itself + crash-only handlers +
# legacy non-TUI pickers): see ALLOWLIST_PATTERN.

set -e
EXIT=0

# Files allowed to touch process.stdin directly. Anchor with file path
# fragments — grep matches anywhere in the path so prefix collisions are OK.
ALLOWLIST_PATTERN='\(vendor/silvery/packages/ag-term/src/runtime/term-provider\.ts\|vendor/silvery/packages/ag-term/src/runtime/input-owner\.ts\|vendor/silvery/packages/ag-term/src/runtime/terminal-lifecycle\.ts\|vendor/silvery/packages/ag-term/src/runtime/create-app\.tsx\|apps/km-tui/src/state/raw-signals\.ts\|vendor/silvery/packages/ag-react/src/render\.tsx\|vendor/silvery/packages/ag-react/src/ui/wrappers/with-select\.ts\|vendor/silvery/packages/ag-react/src/ui/wrappers/with-text-input\.ts\|vendor/silvery/packages/ink/src/ink-stdin\.ts\|vendor/silvery/packages/ink/src/ink-hooks\.ts\|vendor/silvery/packages/theme/src/cli\.ts\|vendor/silvery/examples/\|/tests/\|\.test\.\|\.spec\.\|/dist/\|/node_modules/\|input-owner\.test\.\)'

SEARCH_ROOTS='vendor/silvery apps packages'

# === BASELINES (2026-04-22) =============================================
# Bump DOWN as InputOwner migrations land. Never bump UP — that means a
# new offender slipped in and the CI failure is correct.
BASELINE_SETRAWMODE=10       # stdin.setRawMode call sites outside the allowlist
BASELINE_ON_DATA=12          # stdin.on('data'|'readable', …) call sites outside the allowlist
BASELINE_REMOVE_ALL=0        # stdin.removeAllListeners('data') — must stay zero
BASELINE_ISRAW=4             # const wasRaw = stdin.isRaw — the smell that motivated this script
# =========================================================================

# Sum hits across one or more fixed-string patterns (simpler than juggling
# grep BRE/ERE escapes for the alternation).
count_any() {
  local total=0
  for pattern in "$@"; do
    local n
    n=$(grep -rnF "$pattern" $SEARCH_ROOTS --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -v "$ALLOWLIST_PATTERN" \
      | wc -l | tr -d ' ')
    total=$((total + n))
  done
  echo "$total"
}

list_any() {
  for pattern in "$@"; do
    grep -rnF "$pattern" $SEARCH_ROOTS --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -v "$ALLOWLIST_PATTERN" || true
  done
}

check_baseline() {
  local label="$1"
  local baseline="$2"
  local explanation="$3"
  shift 3
  local actual
  actual=$(count_any "$@")
  if [ "$actual" -gt "$baseline" ]; then
    echo "ERROR: $label — count $actual exceeds baseline $baseline"
    echo "       $explanation"
    list_any "$@" | head -20
    echo "       Use the InputOwner from @silvery/ag-term (see km-silvery.input-owner)."
    EXIT=1
  elif [ "$actual" -lt "$baseline" ]; then
    echo "PROGRESS: $label — count $actual is BELOW baseline $baseline."
    echo "          Lower BASELINE_${label} to $actual in this script and commit."
  fi
}

check_baseline SETRAWMODE "$BASELINE_SETRAWMODE" \
  "New offender. The 'wasRaw snapshot, restore in finally' protocol races under async." \
  "stdin.setRawMode"

check_baseline ON_DATA "$BASELINE_ON_DATA" \
  "InputOwner manages the single data listener — fan out via InputOwner.onData()." \
  'stdin.on("data"' "stdin.on('data'" 'stdin.on("readable"' "stdin.on('readable'"

check_baseline REMOVE_ALL "$BASELINE_REMOVE_ALL" \
  "InputOwner manages its own listener lifecycle — never strip foreign listeners." \
  'stdin.removeAllListeners("data"' "stdin.removeAllListeners('data'"

check_baseline ISRAW "$BASELINE_ISRAW" \
  "The wasRaw capture is the smell that motivated this script — see km-silvery.input-owner." \
  "const wasRaw = stdin.isRaw"

if [ "$EXIT" -eq 0 ]; then
  echo "OK: stdin ownership clean (no new wasRaw race surface)"
fi

exit $EXIT
