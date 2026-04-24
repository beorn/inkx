#!/usr/bin/env bash
# Block raw resource-lifecycle calls that bypass the @silvery/scope tree.
#
# Why this script exists: silvery shipped Scope (= AsyncDisposableStack +
# AbortSignal + child cascade + reconciler-disposal + withScope SIGINT/
# SIGTERM wiring) in 2026-04 across Phase 0/1/2 of km-silvery.lifecycle-
# scope. The infrastructure is ready, but adoption is opt-in. Without an
# enforcement gate, a new contributor can write `setTimeout(cleanup)` or
# `process.on("SIGINT", …)` and silently re-introduce convention-driven
# cleanup — the same shape as the wasRaw race, the 78-process.on audit,
# the useDispose re-render bug. Each cost a session to track down.
#
# The lint rule is what makes the structural fix permanent. Writing the
# anti-pattern is now a CI error, not a documentation footnote.
#
# Strategy: baseline guard. Today's count of pre-existing offenders is
# burned in below. New code that introduces an offender bumps the count
# and fails CI. As Phase 3 migrations land, the count drops and the
# baseline is lowered. Net effect: monotonic progress toward zero,
# no CI churn for code that already exists.
#
# To LOWER the baseline: when you migrate call sites, run this script,
# observe the new count, update the BASELINE_* constants below, commit.
#
# Bead: km-silvery.scope-phase-4-eslint

set -e
EXIT=0

# Files allowed to use raw lifecycle calls. Anchor with file path
# fragments — grep matches anywhere in the path.
#
#   tests/, *.test.*, *.spec.*  — test code can do whatever
#   /dist/, /node_modules/      — built artifacts
#   vendor/*                    — third-party packages have their own lints
#   /scripts/, /tools/, packages/km-infra/  — build & infra tooling
ALLOWLIST_PATTERN='\(/tests/\|\.test\.\|\.spec\.\|/dist/\|/node_modules/\|vendor/silvery/\|vendor/loggily/\|vendor/bearly/\|vendor/termless/\|vendor/flexily/\|vendor/ansi/\|vendor/mdtest/\|vendor/mdspec/\|vendor/vt100\|vendor/vterm\|vendor/lambda\|vendor/loggy\|vendor/accountly\|vendor/tap\|vendor/watcher-chaos\|vendor/vimonkey\|vendor/terminfo\|vendor/lambda-tape\|/scripts/\|packages/km-infra/\|tools/\)'

SEARCH_ROOTS='apps packages'

# === BASELINES (2026-04-24) =============================================
# Bump DOWN as Phase 3 migrations land. Never bump UP — that means a
# new offender slipped in and the CI failure is correct.
#
# To migrate: wrap with scope.defer or scope.use, e.g.
#   const id = setTimeout(fn, 100)
#   scope.defer(() => clearTimeout(id))
#
# Or via useScopeEffect from @silvery/ag-react in React code.
BASELINE_SETTIMEOUT=46           # setTimeout( call sites — Phase 3.2
BASELINE_SETINTERVAL=9           # setInterval( call sites — Phase 3.2
BASELINE_FS_WATCH=0              # fs.watch( — must stay zero (use scope.use(disposable(watcher, w => w.close())))
BASELINE_SPAWN=0                 # child_process.spawn|fork| — must stay zero (Phase 3.4)
BASELINE_ABORT_CONTROLLER=0      # new AbortController( — must stay zero (use scope.signal)
BASELINE_PROCESS_SIGINT=7        # process.on("SIGINT"|"SIGTERM"|"exit"|"beforeExit") — Phase 3.5
BASELINE_PROCESS_SIGTERM=5       # split per signal name for finer-grained migration tracking
BASELINE_PROCESS_EXIT=7          # process.on("exit"|"beforeExit") — 3 double-quoted + 4 single-quoted
# =========================================================================

# Sum hits across one or more fixed-string patterns.
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
    echo "       Wrap in scope: const x = …; scope.defer(() => cleanup(x))"
    echo "       Or use useScopeEffect from @silvery/ag-react in React code."
    echo "       See hub/silvery/design/lifecycle-scope.md for the full pattern."
    EXIT=1
  elif [ "$actual" -lt "$baseline" ]; then
    echo "PROGRESS: $label — count $actual is BELOW baseline $baseline."
    echo "          Lower BASELINE_${label} to $actual in this script and commit."
  fi
}

check_baseline SETTIMEOUT "$BASELINE_SETTIMEOUT" \
  "Raw setTimeout escapes scope ownership. Pair with clearTimeout via scope.defer." \
  'setTimeout('

check_baseline SETINTERVAL "$BASELINE_SETINTERVAL" \
  "Raw setInterval keeps the event loop alive past scope dispose. Use scope.defer to clearInterval." \
  'setInterval('

check_baseline FS_WATCH "$BASELINE_FS_WATCH" \
  "Bare fs.watch leaks watchers across scope boundaries. Wrap with scope.use(disposable(watcher, w => w.close()))." \
  'fs.watch('

check_baseline SPAWN "$BASELINE_SPAWN" \
  "Bare child_process.spawn/fork can outlive the parent. Wrap with scope.use(disposable(proc, p => p.kill('SIGTERM')))." \
  'child_process.spawn(' 'child_process.fork('

check_baseline ABORT_CONTROLLER "$BASELINE_ABORT_CONTROLLER" \
  "Raw AbortController duplicates scope.signal. Use scope.signal for cancellation that ties to scope lifetime." \
  'new AbortController('

check_baseline PROCESS_SIGINT "$BASELINE_PROCESS_SIGINT" \
  "Raw process.on('SIGINT') bypasses term.signals' topological teardown. Use term.signals.on('SIGINT', …) — returns Disposable, registers in priority order." \
  'process.on("SIGINT"' "process.on('SIGINT'"

check_baseline PROCESS_SIGTERM "$BASELINE_PROCESS_SIGTERM" \
  "Raw process.on('SIGTERM') bypasses term.signals. Use term.signals.on('SIGTERM', …)." \
  'process.on("SIGTERM"' "process.on('SIGTERM'"

check_baseline PROCESS_EXIT "$BASELINE_PROCESS_EXIT" \
  "Raw process.on('exit'|'beforeExit') bypasses term.signals. Use term.signals.on('exit', …) — also handles handler ordering and error isolation." \
  'process.on("exit"' "process.on('exit'" 'process.on("beforeExit"' "process.on('beforeExit'"

if [ "$EXIT" -eq 0 ]; then
  echo "OK: no-raw-lifecycle clean (no scope-bypass surface introduced)"
fi

exit $EXIT
