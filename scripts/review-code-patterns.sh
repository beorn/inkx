#!/usr/bin/env bash
# scripts/review-code-patterns.sh
# Runs all code review detection patterns with structured output
#
# Usage: bash scripts/review-code-patterns.sh
# Output: Structured sections with headers for each pattern

set -euo pipefail

echo "=== PATTERN 1: Classes ==="
grep -rn "^export class\|^class [A-Z]" packages apps --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.spec.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 2: Module-level state ==="
grep -rn "^let [a-zA-Z_][a-zA-Z0-9_]*.*=\|^const [a-zA-Z_]* = new" packages apps \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|const debug =" || true
echo ""

echo "=== PATTERN 3: Deprecated exports ==="
grep -rn "@deprecated" packages apps --include="*.ts" -B2 -A2 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 4: Global getters ==="
grep -rn "export function get[A-Z][a-zA-Z]*(" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|getNode\|getTree\|getChildren" || true
echo ""

echo "=== PATTERN 5: Backwards compat shims ==="
grep -rn "export \{.*as.*\}" packages apps --include="*.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|index.ts" || true
echo ""

echo "=== PATTERN 6: Defensive fallbacks ==="
grep -rn "?? \(true\|false\|0\|\[\]\|\{\}\)" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" | head -50 || true
echo ""

echo "=== PATTERN 7: Regex in loops ==="
grep -rn "new RegExp\|/.*/.test\|/.*/.exec" packages apps --include="*.ts" \
  -B3 2>/dev/null | grep -E "(for|while|forEach|map|filter)" | head -50 || true
echo ""

echo "=== PATTERN 8: JSON in loops ==="
grep -rn "JSON\.(parse|stringify)" packages apps --include="*.ts" \
  -B3 2>/dev/null | grep -E "(for|while|forEach|map|filter)" | head -50 || true
echo ""

echo "=== PATTERN 9: Sync file operations ==="
grep -rn "Sync\(" packages/km-storage --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 10: Multiple regex replacements ==="
grep -rn "\.replace.*new RegExp.*\.replace.*new RegExp" packages apps \
  --include="*.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 11: Factory without options ==="
grep -rn "export function create[A-Z][a-zA-Z]*(" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "options" | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 12: Missing Symbol.dispose ==="
# Find files with create functions but no Symbol.dispose
for file in $(grep -rl "export function create" packages apps --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true); do
  if ! grep -q "Symbol\.\(async\)\?Dispose" "$file" 2>/dev/null; then
    echo "$file"
  fi
done | head -20 || true
echo ""

echo "=== PATTERN 13: Missing closed checks ==="
# Find files with create functions but no closed/ensureOpen checks
for file in $(grep -rl "export function create" packages apps --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true); do
  if ! grep -q "closed.*throw\|ensureOpen" "$file" 2>/dev/null; then
    echo "$file"
  fi
done | head -20 || true
echo ""

echo "=== PATTERN 14: Calling singletons ==="
grep -rn "getDb()\|emit()\|getEventHub()" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|@deprecated" || true
echo ""

echo "=== PATTERN 15: parseMarkdownWithLinks usage ==="
# Multiple files using the same parser suggests potential shared wrapper needed
grep -rln "parseMarkdownWithLinks" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|index.ts" || true
echo ""

echo "=== PATTERN 16: Inline map building from DB ==="
# Building lookup maps inline suggests extractable pattern
grep -rn "new Map<.*string" packages apps --include="*.ts" \
  --exclude="*.test.ts" -A3 2>/dev/null | grep -E "\.query\(|\.all\(\)" | head -20 || true
echo ""

echo "=== PATTERN 17: Duplicate DB queries ==="
# Same SQL pattern in multiple files suggests shared query needed
for query in "SELECT.*FROM nodes WHERE type = 'file'" "findNodeByName\|findFileByName" "findChildByContent"; do
  count=$(grep -rln "$query" packages apps --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" | wc -l)
  if [ "$count" -gt 1 ]; then
    echo "Query pattern '$query' appears in $count files:"
    grep -rln "$query" packages apps --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" | head -5
  fi
done || true
echo ""

echo "Pattern detection complete."
