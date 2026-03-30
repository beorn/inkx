#!/usr/bin/env bash
# scripts/review-code-patterns.sh
# Pattern detection for code review
# Catches patterns NOT covered by oxlint/knip
#
# Usage: bash scripts/review-code-patterns.sh
# Output: Structured sections with headers for each pattern
#
# Tooling coverage (handled elsewhere):
#   - CommonJS imports: oxlint no-require-imports
#   - Deprecated usage: oxlint no-deprecated
#   - Unused files/exports: knip (bun lint:unused)

set -euo pipefail

# =============================================================================
# CODE SMELLS (Patterns 1-6)
# =============================================================================

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

# =============================================================================
# PERFORMANCE (Patterns 7-10)
# =============================================================================

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

# =============================================================================
# COMPOSITION (Patterns 11-16)
# =============================================================================

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

echo "=== PATTERN 15: Promise.all chains ==="
# Promise.all(x.map(...)) should use async generators instead
grep -rn "Promise\.all.*\.map\(" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 16: Not using dispose ==="
# Manual cleanup calls that could use `using` instead
grep -rn "\.close()\|\.dispose()\|\.release()\|\.destroy()\|\.end()\|\.disconnect()\|\.stop()\|\.abort()\|\.unsubscribe()" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|Symbol\.\(async\)\?Dispose" || true
echo ""

# =============================================================================
# IMPORTS (Patterns 17-18)
# Note: CommonJS covered by oxlint no-require-imports
# =============================================================================

echo "=== PATTERN 17: Vendor path imports ==="
# Import via relative/absolute path instead of package name
grep -rn 'from ["'"'"'][^"'"'"']*\/vendor\/' packages apps infra --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" || true
grep -rn 'from ["'"'"']\/Users\/.*\/vendor\/' packages apps infra --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" || true
echo ""

echo "=== PATTERN 18: Package path imports ==="
# Relative paths to packages/ should use @km/ alias
grep -rn 'from ["'"'"']\.\..*\/packages\/' packages apps --include="*.ts" 2>/dev/null | grep -v "node_modules" || true
echo ""

# =============================================================================
# CODE LAYOUT (Patterns 19-21)
# =============================================================================

echo "=== PATTERN 19: Prop drilling ==="
# Components with 5+ props that also spread props (potential drilling)
grep -rn "function.*{[^}]*,[^}]*,[^}]*,[^}]*," packages apps --include="*.tsx" \
  --exclude="*.test.tsx" -A5 2>/dev/null | grep "\.\.\..*Props\|\.\.\.props" | head -20 || true
echo ""

echo "=== PATTERN 20: Import side effects ==="
# Module-level initialization (not const/type declarations)
grep -rn "^let.*=.*await\|^let.*=.*new\|^let.*=.*create" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/\|debug(" || true
echo ""

echo "=== PATTERN 21: Inverted pyramid ==="
# Files where first export appears after line 100 (helpers before main)
count=0
for file in $(find packages apps -name "*.ts" ! -name "*.test.ts" ! -path "*/node_modules/*" ! -path "*/vendor/*" 2>/dev/null); do
  first_export=$(grep -n "^export " "$file" 2>/dev/null | head -1 | cut -d: -f1)
  if [ -n "$first_export" ] && [ "$first_export" -gt 100 ]; then
    echo "$file:$first_export (first export at line $first_export)"
    count=$((count + 1))
    if [ $count -ge 20 ]; then
      echo "... (showing first 20)"
      break
    fi
  fi
done || true
echo ""

# =============================================================================
# TEST/TUI PATTERNS (Patterns 22-27)
# =============================================================================

echo "=== PATTERN 22: createRenderer inside function ==="
# Calling createRenderer inside a test/function body is wasteful - recreates renderer each call
# CORRECT: const render = createRenderer(...) at module level (created once)
# WRONG: createRenderer(...) indented inside describe/it/test blocks (recreated per test)
# Detect by finding createRenderer calls that are indented (not at column 0/1)
grep -rn "^\s\+.*createRenderer" packages apps --include="*.test.ts" --include="*.test.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 23: Old silvery APIs ==="
# Old testing patterns that should use modern app.text / app.ansi:
#   - lastFrame() - old way, use app.ansi for ANSI or app.text for plain
#   - getContainer() - use app.locator() instead (auto-refreshing)
# Note: .screenshot() is allowed in test helpers (BoardTestImpl) that wrap app.text
grep -rn "\.lastFrame()\|\.getContainer()" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 24: stdin.write() for keyboard input ==="
# Old keyboard input pattern: keyToAnsi() + stdin.write()
# New pattern: app.press('key') - Playwright-style API
# Note: stdin.write is OK for raw ANSI sequences in production code, flag test usage
grep -rn "stdin\.write\|keyToAnsi" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 25: createRenderer in production code ==="
# createRenderer is for tests only - production code should use renderStatic()
# Note: src/testing.ts is a test utility exported for test consumption, not production code
grep -rn "createRenderer" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|\.test\.\|tests/\|storybook\|src/testing\.ts" || true
echo ""

echo "=== PATTERN 26: Direct chalk imports ==="
# Should use term.red() etc via createTerm/useTerm, not chalk directly
grep -rn "^import.*from ['\"]chalk['\"]" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 36: Inkx string composition ==="
# Using useTerm()/useStyle() to build ANSI strings in <Text> — should use <Text> style props
# Also catches applyColor() which is the helper for this anti-pattern
# padEnd() in TSX files for layout alignment — should use <Box width={}>
grep -rn "useStyle()\|applyColor(" packages apps vendor --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules" || true
# padEnd used for column alignment in TSX (not padStart which is data formatting)
grep -rn "\.padEnd(" packages apps vendor --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules" || true
echo ""

echo "=== PATTERN 37: Hardcoded colors in TSX (should use \$theme tokens) ==="
# Color props should use $token syntax for theme portability
# Catches: color="red", borderColor="yellow", backgroundColor="black", etc.
# Excludes: $token refs, "undefined", dimColor (boolean), theme-defs (definition site)
# Named ANSI colors that should be theme tokens (not hex — those are caught by Pattern 38)
grep -rn 'color="\(red\|green\|blue\|yellow\|cyan\|magenta\|white\|black\|gray\|redBright\|greenBright\|blueBright\|yellowBright\|cyanBright\|magentaBright\|whiteBright\|blackBright\)"' \
  apps/km-tui/src --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|\.test\.\|tests/\|storybook" || true
echo ""

echo "=== PATTERN 38: Hex color literals in TSX (should use \$theme tokens) ==="
# Hex colors bypass the theme system entirely — won't work on limited terminals
grep -rn '"#[0-9a-fA-F]\{3,6\}"' apps/km-tui/src --include="*.tsx" --include="*.ts" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|\.test\.\|tests/" || true
echo ""

echo "=== PATTERN 39: Hardcoded protocol flags (should use detectTerminalCaps) ==="
# kitty: true, mouse: true without capability detection
# Only flag in app code — library code may legitimately use these
grep -rn 'kitty:\s*true' apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|\.test\.\|tests/\|detectTerminalCaps\|caps\." || true
echo ""

echo "=== PATTERN 27: High complexity functions ==="
# Functions exceeding cyclomatic (>20) or cognitive (>15) complexity thresholds
# Uses oxlint-plugin-complexity for static analysis
bun scripts/complexity-report.ts --brief 2>/dev/null || true
echo ""

# =============================================================================
# DEPRECATED APIS (Patterns 28-30) - see km-deprecations bead
# =============================================================================

echo "=== PATTERN 28: Deprecated silvery APIs ==="
# APIs that should be migrated (see km-deprecations bead)
#   - app.html → app.ansi
#   - useLayout → useContentRect
#   - layoutEqual → rectEqual
#   - computedLayout → contentRect
#   - ANSI_REGEX → stripAnsi()
#   - flexture-adapter → flexture-zero-adapter
grep -rn "app\.html\|useLayout()\|layoutEqual\|computedLayout\|ANSI_REGEX\|flexture-adapter" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 29: Deprecated ansi APIs ==="
# Old @silvery/ansi patterns (see km-deprecations bead)
#   - import chalkX from '@silvery/ansi' → import { createTerm } from '@silvery/ansi'
#   - import { chalk } from '@silvery/ansi' → term.red() etc
#   - supportsExtendedUnderline() → detectExtendedUnderline()
#   - setExtendedUnderlineSupport() → createTerm({ extendedUnderline })
grep -rn "supportsExtendedUnderline\|setExtendedUnderlineSupport\|from.*@silvery/ansi.*chalk\b" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
grep -rn "import chalkX\|import.*default.*from.*@silvery/ansi" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 30: Deprecated km-storage functions ==="
# Functions that have replacements (see km-deprecations bead)
#   - config: getBeadsConfig, getTuiConfig, getConfigPath, getOriginalBeadsConfigPath → loadConfigObject()
#   - testing: createMockWatcher, MockWatcher → createFakeWatcher, FakeWatcher
# Note: km-storage loadRepo is deprecated but km-cli has its own loadRepo wrapper (not deprecated)
grep -rn "getBeadsConfig\|getTuiConfig\|getConfigPath\b\|getOriginalBeadsConfigPath\|createMockWatcher\b\|\bMockWatcher\b" packages apps --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|@deprecated" || true
# km-storage loadRepo - only check within packages/ (km-cli has its own non-deprecated loadRepo)
grep -rn "from.*repo-loader\|from.*@km/storage.*loadRepo" packages --include="*.ts" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|@deprecated\|repo-loader\.ts" || true
echo ""

echo "=== PATTERN 31: Manual layout calculations in app code ==="
# displayWidth() in app code suggests manual layout that should be handled by silvery/flexture
# NOTE: Currently a known workaround for km-silvery-flexgrow bug - review when bug is fixed
# Exclude vendor/ (library code may need it) and test files
grep -rn "displayWidth(" apps packages --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules\|vendor/\|\.test\.\|tests/" || true
echo ""

# =============================================================================
# ALIGNMENT/GUIDELINES (Patterns 32-35) - from docs/principles.md Quick Reference
# =============================================================================

echo "=== PATTERN 32: ensure* defensive checks ==="
# Should let lower levels throw naturally (NOT ensureDir/ensureKmDir - those are setup)
grep -rn "ensureOpen\|ensureValid\|ensureClosed\|ensureConnected\|ensureInitialized" \
  packages apps --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 33: Getters (use plain properties) ==="
# get propertyName() should be plain properties for simple access
grep -rn "^\s*get [a-z][a-zA-Z]*\s*().*{" packages apps --include="*.ts" \
  --exclude="*.test.ts" 2>/dev/null | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 34: opts.ensure embedded side effects ==="
# Options that trigger side effects - caller should handle preconditions
grep -rn "ensure\?: boolean\|ensure: boolean\|\.ensure &&\|\.ensure)" packages apps \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
  | grep -v "node_modules\|vendor/" || true
echo ""

echo "=== PATTERN 35: Switch statements (review for lookup objects) ==="
# Not violations, but candidates for review - many should be lookup objects
# Show count only, full output is too noisy
count=$(grep -rn "switch\s*(" packages apps --include="*.ts" --exclude="*.test.ts" \
  2>/dev/null | grep -v "node_modules\|vendor/" | wc -l)
echo "$count switch statements found (review manually: lookup objects vs discriminated unions)"
grep -rn "switch\s*(" packages apps --include="*.ts" --exclude="*.test.ts" \
  2>/dev/null | grep -v "node_modules\|vendor/" | head -10 || true
echo "..."
echo ""

# =============================================================================
# SILVERY LAYER VIOLATIONS (Patterns 40-41)
# =============================================================================

echo "=== PATTERN 40: Silvery ag imports from ag-term/ag-react (inverted dependency) ==="
# ag is the base package — it must NEVER import from ag-term or ag-react
grep -rn 'from "@silvery/ag-term\|from "@silvery/ag-react' vendor/silvery/packages/ag/src \
  --include="*.ts" 2>/dev/null || true
echo ""

echo "=== PATTERN 41: Silvery package dependency direction violations ==="
# commands, signals, scope, model, headless should NOT import from ag-term
for pkg in commands signals scope model headless; do
  hits=$(grep -rn 'from "@silvery/ag-term' "vendor/silvery/packages/$pkg/src" \
    --include="*.ts" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "[$pkg -> ag-term]"
    echo "$hits"
  fi
done
# tea should not import from ag-term
hits=$(grep -rn 'from "@silvery/ag-term' vendor/silvery/packages/tea/src \
  --include="*.ts" 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "[tea -> ag-term]"
  echo "$hits"
fi
echo ""

echo "Pattern detection complete."
