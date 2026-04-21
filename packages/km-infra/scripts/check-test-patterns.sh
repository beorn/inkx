#!/usr/bin/env bash
# Check for banned test patterns — enforces the testing plateau.
# Run as part of test:ci or pre-commit.
#
# Plateau enforcement strategy:
# - HARD BAN: removed APIs (testEnv) — any usage fails CI.
# - BASELINE GUARD: legacy APIs (app.expectScreen) — count must not grow.
#   Migrate existing callsites over time; new callsites are blocked.
# - WARN: style drift (store.getState() outside helpers).

set -e
EXIT=0

# --- Warn: store.getState() in test files (use app.state instead) ---------
# Excludes helpers/ (infrastructure), signal-store.test.ts (tests the store itself), and FREEZE files
HITS=$(grep -rn "store\.getState()" apps/km-tui/tests/ --include="*.ts" --include="*.tsx" \
  | grep -v "helpers/" | grep -v "node_modules" | grep -v "FREEZE" \
  | grep -v "signal-store.test" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "WARN: $HITS uses of store.getState() in test files (use app.state instead)"
  grep -rn "store\.getState()" apps/km-tui/tests/ --include="*.ts" --include="*.tsx" \
    | grep -v "helpers/" | grep -v "node_modules" | grep -v "FREEZE" \
    | grep -v "signal-store.test" | head -5
fi

# --- Hard ban: testEnv/testEnvWithRepo — removed deprecated aliases -------
HITS=$(grep -rn "\btestEnv\b" apps/km-tui/tests/ --include="*.ts" --include="*.tsx" \
  | grep -v "helpers/" | grep -v "node_modules" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "ERROR: $HITS uses of testEnv (removed — use createDriverTest or createTestApp)"
  grep -rn "\btestEnv\b" apps/km-tui/tests/ --include="*.ts" --include="*.tsx" \
    | grep -v "helpers/" | grep -v "node_modules" | head -5
  EXIT=1
fi

# --- Baseline guard: app.expectScreen — deprecated in favor of matchers ---
# Canonical replacement: expect(app).toContainText(text) / .not.toContainText(text)
# Baseline drained from 166 → 2 in km-all.test-system.plateau-enforcement
# (2026-04-20). The remaining 2 callsites are in visual.test.ts, which
# intentionally exercises the deprecated API as regression coverage until
# it is removed. To fully retire the API: delete expectScreen from test-app.ts,
# drop the visual.test.ts coverage, and set BASELINE_EXPECT_SCREEN=0.
BASELINE_EXPECT_SCREEN=2
HITS=$(grep -rn "\bapp\.expectScreen\b\|\bapp\.expectScreenNot\b" apps/km-tui/tests/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "helpers/" | grep -v "node_modules" | wc -l | tr -d ' ')
if [ "$HITS" -gt "$BASELINE_EXPECT_SCREEN" ]; then
  echo "ERROR: app.expectScreen callsites grew from $BASELINE_EXPECT_SCREEN to $HITS"
  echo "  Canonical replacement: expect(app).toContainText(text) / .not.toContainText(text)"
  echo "  See apps/km-tui/tests/CLAUDE.md and showcase.spec.ts for examples."
  EXIT=1
elif [ "$HITS" -lt "$BASELINE_EXPECT_SCREEN" ]; then
  echo "NOTE: app.expectScreen callsites dropped $BASELINE_EXPECT_SCREEN → $HITS. Lower BASELINE_EXPECT_SCREEN in $0 to lock in the progress."
fi

# --- Baseline guard: .spec.ts file count — curated tier should stay small -
# Journey tests go in .spec.ts; internal tests in .test.ts. Baseline prevents
# drift back into mixed-suffix patterns. Lower BASELINE_SPEC_FILES as legacy
# files are consolidated or reclassified.
BASELINE_SPEC_FILES=24
SPEC_COUNT=$(find apps/km-tui/tests -type f \( -name "*.spec.ts" -o -name "*.slow.spec.ts" \) \
  | wc -l | tr -d ' ')
if [ "$SPEC_COUNT" -gt "$BASELINE_SPEC_FILES" ]; then
  echo "ERROR: .spec.ts file count grew from $BASELINE_SPEC_FILES to $SPEC_COUNT"
  echo "  Journey tests belong in .spec.ts, internal tests in .test.ts."
  echo "  See apps/km-tui/tests/CLAUDE.md § 'When to Use .spec.ts vs .test.ts'."
  EXIT=1
fi

# --- Hard ban: app.dispatch() from inside a React hook handler -----------
# Silvery's apply-chain dispatcher throws "Reentrant dispatch" when dispatch
# is called while a dispatch is in flight. React hooks (useInput, useEffect,
# useLayoutEffect) run synchronously inside the dispatch lifecycle and MUST
# route through a keybinding plugin that returns `[{ type: "dispatch", op }]`
# as an effect. See docs/lessons/input-architecture.md § "React hooks never
# call app.dispatch()" and bead km-silvery.tea-useinput-cannot-dispatch.
#
# Scope: apps/km-tui/src/ + packages/km-commands/src/.
# Matches: `app.dispatch(` or `runner.dispatch(` on any line in a file that
# also imports/uses useInput, useEffect, or useLayoutEffect.
# False positives: store.dispatchBoard (zustand layer) is a DIFFERENT
# dispatcher — bare `dispatchBoard(` is not matched.
HITS=0
HIT_FILES=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  # File must actually CALL useInput/useEffect/useLayoutEffect (not just mention
  # them in comments/strings) AND actually CALL app.dispatch/runner.dispatch on
  # a non-comment line.
  # Heuristic: match `<name>(` on a line that does not start with `*`, `//`, or
  # contain ` * ` (block-comment continuations). Grep -v strips those lines.
  if grep -E '\b(useInput|useEffect|useLayoutEffect)\s*\(' "$file" 2>/dev/null \
       | grep -vE '^\s*(\*|//|/\*)|^\s*\*\s' >/dev/null \
    && grep -E '\b(app|runner|chain)\.dispatch\s*\(' "$file" 2>/dev/null \
       | grep -vE '^\s*(\*|//|/\*)|^\s*\*\s' >/dev/null; then
    HITS=$((HITS + 1))
    HIT_FILES="$HIT_FILES $file"
  fi
done < <(find apps/km-tui/src packages/km-commands/src -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null)
if [ "$HITS" -gt 0 ]; then
  echo "ERROR: $HITS file(s) combine React hooks (useInput/useEffect/useLayoutEffect) with app.dispatch()/runner.dispatch()."
  echo "  Calling silvery TEA dispatch from inside a React hook throws 'Reentrant dispatch' at runtime."
  echo "  Route the key/event through a keybinding plugin that returns [{ type: 'dispatch', op }] as an effect."
  echo "  See docs/lessons/input-architecture.md § 'React hooks never call app.dispatch()'."
  echo "  Bead: km-silvery.tea-useinput-cannot-dispatch"
  echo "  Files:"
  for f in $HIT_FILES; do
    echo "    $f"
    grep -nE '(app|runner|chain)\.dispatch\(' "$f" | head -3 | sed 's/^/      /'
  done
  EXIT=1
fi

echo "Test pattern check complete"
exit $EXIT
