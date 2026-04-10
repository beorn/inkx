#!/usr/bin/env bash
# Check for banned test patterns
# Run as part of test:ci or pre-commit

set -e
EXIT=0

# Warn about store.getState() in test files (use app.state instead)
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

# Ban testEnv in NEW test files (only allowed in files with FREEZE comment)
HITS=$(grep -rn "testEnv\b" apps/km-tui/tests/ --include="*.ts" --include="*.tsx" \
  | grep -v "helpers/" | grep -v "node_modules" | grep -v "import.*from" \
  | grep -v "FREEZE" | grep -v "@deprecated" | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "WARN: $HITS uses of testEnv outside FREEZE bucket (prefer createTestApp)"
fi

echo "Test pattern check complete"
exit $EXIT
