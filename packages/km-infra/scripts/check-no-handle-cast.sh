#!/usr/bin/env bash
# Block `as <Foo>Handle` type assertions outside the factories that own them.
#
# Why this script exists: silvery's @silvery/scope ships an opaque-branded
# handle pattern (defineHandle("Foo") + finaliseHandle()). The brand is a
# per-call-site `unique symbol` — accidental object-literal construction
# fails compile (TS2322), and forged values are rejected by the runtime
# WeakSet authenticity gate inside adoptHandle() / Scope.use().
#
# The hole the runtime gate doesn't close: `as TickHandle` casts. TS
# accepts them silently because both source and target are object types.
# Per Kimi's pro/Kimi review of Phase 1: "the brand is structural, not
# nominal" — `as`-casts compile through the structural brand even though
# the runtime WeakSet would reject the resulting forged handle if the
# caller tried to adopt it into a scope.
#
# This script is the convention-driven complement to the runtime gate:
#   - Type-system: unique-symbol brand stops object-literal construction.
#   - Lint: this script stops `as XHandle` cast escapes.
#   - Runtime: WeakSet rejects forged handles at adoptHandle() / use().
#
# Together: a leaked or impostor handle is impossible to construct AND
# impossible to register, even if the lint were bypassed.
#
# Strategy: deny-by-default with an explicit allowlist of the factory
# files that legitimately need the cast (where finaliseHandle returns a
# wider `H & S` type that has to be narrowed to the public Handle type).
#
# Bead: km-silvery.handle-cast-lint (salvaged from the
# scope-resource-ownership feat branch; allowlist trimmed to the one
# scoped factory that actually shipped — scoped-tick.ts).

set -e
EXIT=0

# Files allowed to use `as XHandle` casts.
#
# - Factories own the cast: finaliseHandle returns `H & S`; the factory is
#   the only place that can legitimately narrow that to the public Handle
#   type (e.g. `as TickHandle`).
# - Tests, dist, and vendor packages have their own conventions.
#
# Currently only scoped-tick.ts has shipped. When scoped-runtime.ts or
# scoped-input-owner.ts (or any new scoped-foo.ts) lands, append the path
# here AND extend PATTERN_REGEX below to match its handle type.
ALLOWLIST_PATTERN='\(/tests/\|\.test\.\|\.spec\.\|\.test-types\.\|/dist/\|/node_modules/\|/\.claude/worktrees/\|vendor/silvery/packages/ag-term/src/runtime/scoped-tick\.ts\|vendor/silvery/packages/scope/\|vendor/loggily/\|vendor/bearly/\|vendor/termless/\|vendor/flexily/\|vendor/ansi/\|vendor/mdtest/\|vendor/mdspec/\|vendor/vt100\|vendor/vterm\|vendor/lambda\|vendor/loggy\|vendor/accountly\|vendor/tap\|vendor/watcher-chaos\|vendor/vimonkey\|vendor/terminfo\|vendor/lambda-tape\|/scripts/\|packages/km-infra/\|tools/\)'

SEARCH_ROOTS='apps packages vendor/silvery'

# === BASELINE (2026-04-28) ==============================================
# Bump DOWN as casts are removed. Never bump UP — that means a new cast
# slipped in and the CI failure is correct.
#
# Legitimate casts (factory call sites) are in the allowlist above. Any
# count this script reports is from outside-the-allowlist code that
# should NOT be casting to a Handle type.
BASELINE_HANDLE_CAST=0
# ========================================================================

# Pattern: ` as TickHandle`.
# Whitespace before `as` is required to avoid matching identifiers ending
# in `as`.
#
# Currently this list enumerates ONLY brand types produced by
# `defineHandle()` in @silvery/scope that have actually shipped.
# `RuntimeHandle` and `InputOwnerHandle` were drafted on the
# scope-resource-ownership feat branch but their factories
# (scoped-runtime.ts, scoped-input-owner.ts) did not ship. When they do,
# extend this regex AND add the factory path to ALLOWLIST_PATTERN above.
#
# Other types ending in "Handle" (AppHandle, TextHandle, RunHandle,
# SessionHandle) are unrelated framework concepts and must NOT be
# conflated with branded handles.
PATTERN_REGEX=' as (TickHandle)\b'

count_casts() {
  grep -rnE "$PATTERN_REGEX" $SEARCH_ROOTS --include='*.ts' --include='*.tsx' 2>/dev/null \
    | grep -v "$ALLOWLIST_PATTERN" \
    | wc -l | tr -d ' '
}

list_casts() {
  grep -rnE "$PATTERN_REGEX" $SEARCH_ROOTS --include='*.ts' --include='*.tsx' 2>/dev/null \
    | grep -v "$ALLOWLIST_PATTERN" || true
}

actual=$(count_casts)
if [ "$actual" -gt "$BASELINE_HANDLE_CAST" ]; then
  echo "ERROR: HANDLE_CAST — count $actual exceeds baseline $BASELINE_HANDLE_CAST"
  echo "       \`as XHandle\` casts forge through the structural brand."
  echo "       The runtime WeakSet still rejects the forgery at adoptHandle()/Scope.use(),"
  echo "       but the cast destroys the compile-time guarantee that makes the pattern useful."
  echo ""
  echo "       Offending lines:"
  list_casts | head -20
  echo ""
  echo "       Fix: do not cast. Construct via the scoped factory:"
  echo "         const t = createScopedTick(scope, 16)        // TickHandle, no cast needed"
  echo ""
  echo "       If you genuinely need a new handle kind, add a scoped factory file"
  echo "       under vendor/silvery/packages/ag-term/src/runtime/scoped-*.ts and"
  echo "       extend the ALLOWLIST_PATTERN above to whitelist it."
  EXIT=1
elif [ "$actual" -lt "$BASELINE_HANDLE_CAST" ]; then
  echo "PROGRESS: HANDLE_CAST — count $actual is BELOW baseline $BASELINE_HANDLE_CAST."
  echo "          Lower BASELINE_HANDLE_CAST to $actual in this script and commit."
fi

if [ "$EXIT" -eq 0 ]; then
  echo "OK: no-handle-cast clean (no \`as XHandle\` cast escapes outside factories)"
fi

exit $EXIT
