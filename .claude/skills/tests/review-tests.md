---
description: Review and prune test suite for overlap, speed, and organization
argument-hint: [package | --full | --dry-run]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Test Review

Review tests for pruning, overlap, and architecture alignment.

**Target**: $ARGUMENTS
**Reference**: See `docs/dev/test-review.md` for full checklist and guidelines.
**Fakes Guide**: See `docs/dev/test-fakes.md` for fake inventory and when to use each.
**Related**: `/code review` (architecture), `/code types` (type safety)

## Contents

- [Modes](#modes)
- [Phase 1: Inventory](#phase-1-inventory)
- [Phase 1.5: DI Compliance Check](#phase-15-di-compliance-check)
- [Phase 1.6: Test Setup Complexity Check](#phase-16-test-setup-complexity-check)
- [Phase 1.7: Expensive Fixture Setup Check](#phase-17-expensive-fixture-setup-check)
- [Phase 1.8: Test Infrastructure Grooming](#phase-18-test-infrastructure-grooming)
- [Phase 2: Import Cost Profiling (Deep Dive)](#phase-2-import-cost-profiling-deep-dive)
- [Phase 2.5: Layer Analysis](#phase-25-layer-analysis)
- [Phase 3: Overlap Detection](#phase-3-overlap-detection)
- [Phase 3.5: File Proliferation Check](#phase-35-file-proliferation-check)
- [Phase 3.8: Layer Violation Detection](#phase-38-layer-violation-detection)
- [Phase 4: Smell Detection](#phase-4-smell-detection)
- [Phase 5: Report](#phase-5-report)

## Modes

| Argument    | Behavior                                     |
| ----------- | -------------------------------------------- |
| (none)      | Review all tests, output report              |
| `<package>` | Review specific package (e.g., `km-storage`) |
| `--full`    | Include detailed taxonomy of every test      |
| `--dry-run` | Analysis only, no action recommendations     |

---

## Phase 1: Inventory

Run in parallel to count tests:

```bash
# Test file counts by type
echo "=== Test File Counts ==="
echo "Fast unit (ts): $(find packages apps -name '*.test.ts' ! -name '*.slow*' ! -name '*.playwright*' 2>/dev/null | wc -l)"
echo "Fast mdspec (md): $(find packages apps tests -name '*.spec.md' ! -name '*.slow*' 2>/dev/null | wc -l)"
echo "Slow integration: $(find packages apps -name '*.slow.test.ts' 2>/dev/null | wc -l)"
echo "Slow mdspec: $(find packages apps tests -name '*.slow.spec.md' 2>/dev/null | wc -l)"
echo "Playwright: $(find packages apps -name '*.playwright.ts' 2>/dev/null | wc -l)"
echo "Chaos: $(find packages -path '*/chaos/*.test.ts' 2>/dev/null | wc -l)"
echo "Yoga (vendor): $(find vendor/flexily/tests/yoga -name '*.test.ts' 2>/dev/null | wc -l)"

# Tests per package
echo -e "\n=== Tests by Package ==="
for dir in packages/*/tests apps/*/tests; do
  [ -d "$dir" ] && echo "$dir: $(grep -r 'test(\|it(' "$dir" 2>/dev/null | wc -l) tests"
done
```

For `--full`, also generate taxonomy:

```bash
# Detailed file listing
find packages apps -name "*.test.ts" -o -name "*.slow.test.ts" -o -name "*.spec.md" | \
  xargs wc -l 2>/dev/null | sort -n | tail -30
```

## Phase 1.5: DI Compliance Check

Run these checks to verify proper infrastructure usage:

```bash
# Tests using deprecated getDb/setDb (MUST BE ZERO)
echo "=== Singleton Usage ==="
grep -r "getDb()\|setDb(" packages/*/tests/*.test.ts apps/*/tests/*.test.ts 2>/dev/null | wc -l

# Tests creating raw Database (should use withTestEnv)
echo "=== Raw Database Creation ==="
grep -r "new Database" packages/*/tests/*.test.ts apps/*/tests/*.test.ts 2>/dev/null | grep -v ".slow." | wc -l

# mdspecs without memory: true (SHOULD BE ZERO for fast tests)
echo "=== mdspecs without memory: true ==="
for f in apps/km-cli/tests/sh/*.spec.md; do
  grep -q "memory: true" "$f" || echo "$f"
done

# Sync tests using real watcher (should use useWorker: false)
echo "=== Real Watcher Usage ==="
grep -r "useWorker: true" packages/*/tests/*.test.ts 2>/dev/null | grep -v ".slow." | wc -l

# Tests with console output (should be silent on success)
echo "=== Console Output in Tests ==="
grep -rn "console\.\(log\|info\|warn\|debug\)" packages/*/tests/*.test.ts apps/*/tests/*.test.ts 2>/dev/null | grep -v ".slow." | wc -l

# TUI tests using withTestEnv (should use createFakeRepo)
echo "=== TUI Tests Using withTestEnv ==="
grep -l "withTestEnv" apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts 2>/dev/null | wc -l

# Board package tests using withTestEnv (should use fakes for state tests)
echo "=== Board Tests Using withTestEnv ==="
grep -l "withTestEnv" packages/km-board/tests/*.test.ts 2>/dev/null | wc -l

# Tests importing runtime (not type-only) db functions but testing UI logic
echo "=== Potential Misuse: DB imports in UI tests ==="
for f in apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts; do
  if [ -f "$f" ] && grep -q "^import {" "$f" && grep "^import {" "$f" | grep -q "@km/storage" && ! grep -q "withTestEnv\|createFakeRepo" "$f"; then
    echo "$f"
  fi
done 2>/dev/null
```

**Expected results:**

- Singleton usage: 0
- Raw Database in fast tests: 0
- mdspecs without memory: 0
- Real watcher in fast tests: 0
- Console output in fast tests: 0 (tests should be silent on success)
- TUI tests using withTestEnv: 0 (should use createFakeRepo)
- Board tests using withTestEnv: 0 (should use fakes for state tests)

## Phase 1.6: Test Setup Complexity Check

Look for test helpers that duplicate production setup patterns:

```bash
# Large test helper files (>100 lines may duplicate domain logic)
echo "=== Large Test Helpers ==="
find packages apps -path "*/tests/*" -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts" -exec wc -l {} \; 2>/dev/null | \
  awk '$1 > 100 {print}' | sort -rn

# Complex setup functions
echo "=== Setup/TestEnv Functions ==="
grep -rn "^export \(function\|const\) \(setup\|createTest\|withTest\|testEnv\|makeTest\)" packages/*/tests apps/*/tests 2>/dev/null

# Test-specific factories that may duplicate production factories
echo "=== Test Factory Functions ==="
grep -rn "^export \(function\|const\) create.*\(For\|In\)Test" packages/*/tests apps/*/tests 2>/dev/null
```

**Red flags to investigate:**

- **Helper >150 lines**: May be reimplementing domain logic
- **`createTest*` paralleling `create*`**: Should compose production factory instead
- **`withTestEnv` doing more than DI**: Should only inject dependencies, not construct domain objects
- **Multiple packages with similar test setup**: Extract to shared test utilities or fix production composability

**Resolution pattern:**

1. Identify what the test setup is constructing
2. Check if production code offers equivalent composition
3. If not, refactor production to expose composable construction
4. Simplify test setup to call production factories with test dependencies

## Phase 1.7: Expensive Fixture Setup Check

Look for test files where fixture setup (testEnv, createTestBoard, createBoardDriver) is duplicated:

```bash
# Count expensive setup calls per file (testEnv, createTestBoard, createBoardDriver)
echo "=== Expensive Setup Calls Per File ==="
for f in apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts apps/km-tui/tests/*.test.tsx apps/km-tui/tests/*.spec.tsx; do
  [ -f "$f" ] || continue
  count=$(grep -c 'testEnv\|createTestBoard\|createBoardDriver' "$f" 2>/dev/null)
  [ "$count" -gt 5 ] && echo "  $count calls: $(basename "$f")"
done | sort -rn

# Find identical fixtures that could be shared
echo -e "\n=== Potentially Shareable Fixtures ==="
echo "(Files with >15 setup calls are candidates for combining tests)"
for f in apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts; do
  [ -f "$f" ] || continue
  count=$(grep -c 'testEnv\|createTestBoard\|createBoardDriver' "$f" 2>/dev/null)
  [ "$count" -gt 15 ] && echo "  $count calls: $(basename "$f") - review for shared fixtures"
done
```

**Red flags:**
- **>15 testEnv() calls in a single file**: Tests with identical fixtures should share setup
- **Identical `item()` trees across tests**: Combine into longer journey tests (per board.spec.ts philosophy)
- **testEnv() inside test.each()**: Each iteration creates a new board — consider sharing where possible

**Resolution pattern:**
1. Identify tests with identical fixtures
2. Combine into longer journey tests that exercise multiple behaviors with one fixture
3. Preserve test isolation: only combine when navigation can be reset between assertions

## Phase 1.8: Test Infrastructure Grooming

This phase checks that the test infrastructure itself (CLAUDE.md files, layering docs, helpers) is well-maintained.

### 1. Test CLAUDE.md Coverage Check
```bash
# Every tests/ directory should have a CLAUDE.md
echo "=== Test Directories Without CLAUDE.md ==="
for dir in packages/*/tests apps/*/tests vendor/*/tests; do
  [ -d "$dir" ] && [ ! -f "$dir/CLAUDE.md" ] && echo "  MISSING: $dir"
done
```

**Expected:** All test directories should have a CLAUDE.md that describes:
- Layer number and what it tests vs trusts
- Available test helpers
- Example test patterns
- Ad-hoc testing commands

### 2. Layering Consistency Check
```bash
# Verify all test CLAUDE.md files reference test-layers.md
echo "=== CLAUDE.md files not referencing test-layers.md ==="
for f in packages/*/tests/CLAUDE.md apps/*/tests/CLAUDE.md vendor/*/tests/CLAUDE.md; do
  [ -f "$f" ] && ! grep -q "test-layers" "$f" && echo "  $f"
done
```

### 3. Helper Documentation Check
```bash
# Find test helpers not documented in their package's CLAUDE.md
echo "=== Undocumented test helpers ==="
for dir in packages/*/tests apps/*/tests; do
  [ -d "$dir" ] || continue
  helpers=$(find "$dir" -name "*.ts" ! -name "*.test.ts" ! -name "*.spec.ts" ! -name "*.bench.ts" ! -name "*.fuzz.ts" -type f 2>/dev/null)
  if [ -n "$helpers" ] && [ -f "$dir/CLAUDE.md" ]; then
    for h in $helpers; do
      basename=$(basename "$h")
      grep -q "$basename" "$dir/CLAUDE.md" || echo "  $dir: $basename not in CLAUDE.md"
    done
  fi
done
```

### 4. Stale CLAUDE.md Check
Look for test CLAUDE.md files that reference files that no longer exist or miss recently added helpers.

**Red flags:**
- **Missing CLAUDE.md**: Every test directory should have one
- **CLAUDE.md not referencing test-layers.md**: Test layering philosophy should be linked
- **Undocumented helpers**: All test utilities should be listed in their package's CLAUDE.md
- **Stale references**: CLAUDE.md mentions files that have been renamed/deleted

**Resolution:**
1. Create missing CLAUDE.md files using the template from test-layers.md
2. Add test-layers.md "See Also" link to all test CLAUDE.md files
3. Document any undocumented helpers
4. Remove stale references

## Phase 2: Import Cost Profiling (Deep Dive)

Profile representative tests from each layer to understand the actual import cost structure. This reveals where file consolidation saves the most time.

### Methodology

Pick 3-4 representative tests spanning the cost spectrum:

```bash
# Layer 0: Pure logic (no silvery/React)
time bun vitest run apps/km-tui/tests/layout/constrain.test.ts 2>&1 | grep "Transform\|Duration"

# Layer 1: Component unit (React, some silvery)
time bun vitest run apps/km-tui/tests/views/node-view.test.tsx 2>&1 | grep "Transform\|Duration"

# Layer 2: Integration (testEnv/silvery full pipeline)
time bun vitest run apps/km-tui/tests/hr.test.ts 2>&1 | grep "Transform\|Duration"
```

### Import Cost Reference

| Layer | Type | Typical Import Cost | Example |
|---|---|---|---|
| 0 | Pure Logic | ~20-50ms | `layout/constrain.test.ts`, `text/inline-parser.test.ts` |
| 0+ | Some imports | ~500-700ms | `input-mode.test.ts` (zustand, but no silvery) |
| 1 | Component Unit | ~200ms | `views/node-view.test.tsx` |
| 2 | Integration (testEnv) | ~1.8s | `hr.test.ts`, `alignment.test.ts` |
| 3 | Acceptance (multi-step) | ~1.8s | `fold.slow.test.ts` |
| 4 | TTY/Snapshot | ~1.8s | `pty-integration.slow.spec.ts` |

**Key insight**: Layer 2+ files all share the same ~1.8s import cost because they import `testEnv` which imports `silvery/testing`, which initializes the layout engine (top-level await WASM init). Consolidating Layer 2+ files saves ~1.8s per eliminated file.

### Vitest Worker Analysis

```bash
# Check worker count and parallelization
bun vitest run --reporter=verbose 2>&1 | head -5  # Shows worker count

# Estimated wall-clock savings = (files_saved × per_file_cost) / num_workers
# Example: 15 files × 1.8s / 9 workers ≈ 3s saved
```

### Import Chain Tracing

If a specific import seems expensive, trace its transitive dependencies:

```bash
# Find what a test entry point imports transitively
grep -h "^import\|^export.*from" vendor/silvery/src/testing/index.tsx | head -20

# Check if it pulls in the main barrel (bad) vs direct imports (good)
grep "from ['\"]\.\.\/index" vendor/silvery/src/testing/index.tsx
```

**Known finding (2026-03)**: `silvery/testing` does NOT import the barrel file — it uses direct imports. The 1.8s cost comes from actual module graph (React, reconciler, layout engine WASM init via `await ensureDefaultLayoutEngine()`).

### Vitest Pre-bundling (optional)

Check if vitest `deps.optimizer` can reduce per-file overhead:

```typescript
// vitest.config.ts — experimental
server: {
  deps: {
    optimizer: {
      web: { include: ["react", "zustand", "jotai"] }
    }
  }
}
```

### Guideline

Prefer lower test layers. A test for pure cursor logic belongs in Layer 0, not Layer 2. When writing new tests, ask: does this test NEED testEnv/silvery, or can it test the logic directly?

## Phase 2.5: Layer Analysis

Use Task agents in parallel to analyze each layer:

1. **Parser tests** (`@km/markdown`) - Should have no database imports
2. **Storage tests** (`@km/storage`) - Should use `/tmp/kmtest-*` directories
3. **Board tests** (`@km/board`) - Should use fixtures, not SQLite
4. **Chaos tests** - Should be in `sync/chaos/`, marked `.slow.test.ts`
5. **Playwright tests** - Should test visual behavior, not state logic

Check for layer violations:

- Storage tests importing UI components
- Board tests opening databases
- Parser tests checking node structure (belongs in tree/storage)

## Phase 3: Overlap Detection

Look for:

1. **Duplicate coverage** - Same behavior tested via different APIs
   - Known: `vault.test.ts` vs `node-crud.test.ts`
   - Known: `navigation.test.ts` vs `cursor-navigation.test.ts` vs `visual-navigation.test.ts`

2. **Superseded tests** - Integration test that covers unit test cases

3. **Test file line counts** - Very large files may have duplication

```bash
# Find large test files (potential duplication)
find packages apps -name "*.test.ts" -exec wc -l {} \; 2>/dev/null | \
  awk '$1 > 500 {print}' | sort -rn
```

## Phase 3.5: File Proliferation Check

Detect one-file-per-bug proliferation that should be consolidated into thematic files.

```bash
# Count test files per directory
echo "=== Test File Counts by Directory ==="
for dir in apps/km-tui/tests packages/*/tests; do
  [ -d "$dir" ] || continue
  count=$(ls "$dir"/*.test.ts "$dir"/*.spec.ts 2>/dev/null | wc -l)
  echo "  $count files: $dir"
done | sort -rn

# Detect files that look like per-bug regressions (bug-specific names)
echo -e "\n=== Potential Per-Bug Files (should be in thematic files) ==="
for f in apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts; do
  [ -f "$f" ] || continue
  base=$(basename "$f" | sed 's/\.\(test\|spec\)\.ts$//')
  # Flag files with 3+ hyphen segments (likely bug-specific names)
  segments=$(echo "$base" | tr '-' '\n' | wc -l)
  [ "$segments" -ge 4 ] && echo "  $(basename "$f") ($segments segments)"
done

# Find small test files (<50 lines, likely single-bug regressions)
echo -e "\n=== Small Test Files (<50 lines) ==="
wc -l apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts 2>/dev/null | \
  awk '$1 < 50 && $1 > 0 {print "  " $1 " lines: " $2}' | sort -n

# Detect thematic overlap (files with similar prefixes)
echo -e "\n=== Potential Thematic Overlaps ==="
for prefix in fold zoom scroll cursor card body hr embed collapse date search edit undo shift sticky layout; do
  files=$(ls apps/km-tui/tests/*${prefix}*.test.ts apps/km-tui/tests/*${prefix}*.spec.ts 2>/dev/null | wc -l)
  [ "$files" -gt 1 ] && echo "  $files files for '$prefix': $(ls apps/km-tui/tests/*${prefix}*.test.ts apps/km-tui/tests/*${prefix}*.spec.ts 2>/dev/null | xargs -I{} basename {} | tr '\n' ' ')"
done
```

**Red flags:**
- **>60 test files in km-tui/tests/**: File proliferation in progress
- **Files with 4+ hyphen segments**: Likely per-bug names (e.g., `fold-border-blank.test.ts`)
- **Files <50 lines**: Likely single-test regression files that should be merged
- **Multiple files sharing a prefix**: Should be one thematic file (e.g., all `fold-*` → `fold.test.ts`)

**Resolution:**
1. Identify the thematic domain for each per-bug file (fold, zoom, scroll, etc.)
2. Merge into the canonical thematic file — see [test-first-protocol.md](test-first-protocol.md#where-to-put-regression-tests) for the domain→file mapping
3. Combine imports, preserve describe blocks, delete source files
4. Verify with `bun vitest run` after each merge

**Target:** km-tui/tests/ should have ~50-65 thematic files, not 90+ per-bug files.

### Deep Dive: File Consolidation Strategy

When file count is high (>70 fast test files), do a systematic consolidation pass:

**Step 1: Domain Merges** (biggest wins — 3-4 small files → 1 domain file)

Look for clusters of files sharing a prefix or domain:
```bash
# Find clusters of related test files
for prefix in breadcrumb overflow col visual fold zoom scroll cursor card embed body hr edit undo sticky layout; do
  files=$(ls apps/km-tui/tests/*${prefix}*.test.* apps/km-tui/tests/*${prefix}*.spec.* 2>/dev/null)
  count=$(echo "$files" | grep -c . 2>/dev/null)
  [ "$count" -gt 1 ] && echo "  $count files for '$prefix'"
done
```

Create a single `<domain>.test.ts` that imports all dependencies once, with describe blocks per original file. Saves ~1.8s per eliminated file (Layer 2+).

**Step 2: Tiny File Absorptions** (1-4 test files absorbed into existing homes)

Files with <5 tests that clearly belong in an existing file:
- Same component being tested
- Same domain/feature area
- Extending an existing test file's coverage

**When NOT to merge:**
- Merging a light (Layer 0) test into a heavy (Layer 2) file — makes the light test slower
- Merging a fast test into a `.slow.` file — removes it from fast suite
- Merging tests with incompatible setup requirements

**Step 3: Overlap Reduction** (delete redundant tests found during merges)

During consolidation, note tests that overlap with existing tests in the target file. Remove the redundant copy.

**Estimated savings**: `(files_eliminated × 1.8s) / vitest_workers ≈ wall_clock_savings`
Example: 15 files × 1.8s / 9 workers ≈ 3s wall-clock improvement.

## Phase 3.8: Layer Violation Detection

Detect tests that re-test behavior owned by a lower layer. Reference [test-layers.md](test-layers.md) for what each layer should test vs trust.

```bash
# km-storage tests that re-verify markdown parsing (belongs in km-markdown)
echo "=== Storage tests re-testing parsing ==="
grep -l "parse\|parseMarkdown\|parseDocument" packages/km-storage/tests/*.test.ts 2>/dev/null | \
  xargs -I{} grep -l "expect.*heading\|expect.*listItem\|expect.*blockquote" {} 2>/dev/null

# km-tui tests that only check state, never screen (belongs in km-board)
echo -e "\n=== TUI tests that never check screen output ==="
for f in apps/km-tui/tests/*.test.ts; do
  [ -f "$f" ] || continue
  if grep -q "expect(" "$f" && ! grep -q "board\.expect\|expectRow\|expectNodeColor\|screen\.\|toExist\|toHaveStyle\|buffer" "$f"; then
    echo "  $(basename "$f") — state-only assertions, may belong in km-board"
  fi
done 2>/dev/null

# km-core tests that verify static lookups (type system should enforce)
echo -e "\n=== Core tests verifying static mappings ==="
grep -n "expect(get.*For.*).toBe\|expect(map\[" packages/km-core/tests/*.test.ts 2>/dev/null

# km-board tests that re-parse markdown (belongs in km-markdown)
echo -e "\n=== Board tests re-testing parsing ==="
grep -l "parse\|parseMarkdown" packages/km-board/tests/*.test.ts 2>/dev/null
```

**Red flags:**
- **Storage test asserting AST structure**: Parsing belongs in km-markdown. Storage should test file ↔ DB round-trips.
- **TUI test with no screen assertions**: If it only checks state/DB, it belongs in km-board or km-storage.
- **Core test for a static lookup**: If `getX("y") === "z"` is a compile-time constant, the type system should enforce it — delete the test.
- **Trivial boolean predicate tests**: `isDone("done") === true` — covered by types, delete.
- **Property readback tests**: `createX({a: 1}).a === 1` — tests nothing, delete.
- **Journey test checking only screen OR only persistence**: Should check BOTH — screen output AND saved data — to guard the full boundary chain.

**Resolution:**
1. Move the test to the correct layer, or
2. Delete if lower-layer tests already cover it, or
3. Elevate to a journey test if it's testing a user-visible behavior at the wrong abstraction level

## Phase 4: Smell Detection

Apply checklist from `docs/dev/test-review.md`:

**Delete candidates**:

- Tautology tests
- Tests the mock
- Obsolete features
- Flaky tests
- Covered by types
- **Cross-layer re-testing** — test re-verifies behavior owned by a lower layer (see Phase 3.8)
- **Trivial property readback** — `createX({a: 1}).a === 1`
- **Static map testing** — `getMarkerForStatus("done") === "[x]"` when the type system enforces the mapping

**Fix candidates**:

- Console output (tests should be silent on success)
- `withTestEnv` in TUI/Board tests → should use `createFakeRepo()` (see `docs/dev/test-fakes.md`)

**Merge candidates**:

- Same setup, different assertions
- Sequential dependencies

**Move layer candidates**:

- > 10 mocks → move up
- Pure function with database → move down

**Optimize candidates**:

- Identical fixtures across tests (combine into journey tests)
- >15 testEnv() calls per file (expensive board setup)
- Loop-based navigation with >20 items (reduce dataset size)

**Ergonomics candidates** (test readability):

- Raw `store.getState().setUI(...)` → should use `board.setUI()` or `board.editNode()`
- Raw `getActiveBoardPane(store.getState())?.field` assertions → should use `board.expectEditing()`, `board.expectNotEditing()`, or `board.expectState()`
- Verbose multi-line sequences that could be fluent chains (e.g., setUI + flush + assert → `board.editNode(...).press(...).expectEditing(...)`)
- Store destructuring (`{ board, store }`) when only `{ board }` is needed (store access hidden behind helpers)
- Importing `getActiveBoardPane` in test files that only use it for assertions (should use board helpers instead)

**Refactor candidates** (test setup complexity):

- Test helper that mirrors production factory (e.g., `createTestRepo` vs `createRepo`)
- Setup function >50 lines constructing domain objects
- Multiple test files with similar boilerplate setup
- Test-only abstractions that should be production composability

## Phase 5: Report

Output structured findings:

```markdown
## Test Review: YYYY-MM-DD

### Summary

| Metric            | Count |
| ----------------- | ----- |
| Total test files  | N     |
| Total tests       | N     |
| Fast tests        | N     |
| Slow tests        | N     |
| Playwright tests  | N     |
| Chaos tests       | N     |
| Delete candidates | N     |
| Merge candidates  | N     |
| Refactor setup    | N     |

### DI Compliance

| Check                         | Count | Target | Status |
| ----------------------------- | ----- | ------ | ------ |
| Singleton usage (getDb/setDb) | N     | 0      | ✅/❌  |
| Raw Database in fast tests    | N     | 0      | ✅/❌  |
| mdspecs without memory: true  | N     | 0      | ✅/❌  |
| Real watcher in fast tests    | N     | 0      | ✅/❌  |
| Console output in fast tests  | N     | 0      | ✅/❌  |
| Test helpers >150 lines       | N     | 0      | ✅/❌  |
| TUI tests using withTestEnv   | N     | 0      | ✅/❌  |
| Board tests using withTestEnv | N     | 0      | ✅/❌  |

### Vendor Test Freshness

| Check                  | Last Updated | Latest Upstream | Status |
| ---------------------- | ------------ | --------------- | ------ |
| Yoga tests (flexily)     | YYYY-MM-DD   | vX.Y.Z          | ✅/❌  |

### Performance

| Metric                  | Value | Target   | Status |
| ----------------------- | ----- | -------- | ------ |
| test:fast time          | Xs    | <20s     | ✅/❌  |
| Unmarked slow tests     | N     | 0        | ✅/❌  |
| Fixture setup calls     | N     | <varies> | ⚠️/✅  |

### By Layer

| Layer | Files | Tests | Issues |
| ----- | ----- | ----- | ------ |

### Action Items

#### A. Delete (N)

| File:Line | Test | Reason |

#### B. Merge (N)

| Source | Into | Reason |

#### C. Move (N)

| File:Line | From | To | Reason |

#### D. Fix (N)

| File:Line | Issue | Fix |

#### E. Refactor Setup (N)

| Test Helper | Production Gap | Proposed Change |

_For each refactor: identify what production composability is missing, then simplify test setup to use production factories with injected test dependencies._
```

**Stop here if `--dry-run`**.

## Phase 6: Execute

After user confirms categories via AskUserQuestion:

1. Delete obsolete tests
2. Merge duplicates
3. Move tests to correct layer
4. Run verification:

```bash
bun run test:fast   # Should still pass
bun run test:all    # Full verification
```

Compare timing before/after.

## Retrospective: Test Infrastructure Learnings

After completing test review and executing changes, analyze patterns for continuous improvement.

### 1. Pattern Recognition

Review test issues found to identify recurring themes:

**Key questions:**

- Which categories had most issues? (Delete, merge, move, fix, refactor setup)
- Were problems clustered in specific layers or packages?
- Did test complexity correlate with production code complexity?
- Were issues symptoms of missing test infrastructure?

### 2. Root Cause Analysis

For each major pattern, identify why it occurred:

| Pattern Example               | Root Cause Hypothesis               | Evidence/Context                          |
| ----------------------------- | ----------------------------------- | ----------------------------------------- |
| Many DI compliance violations | Infrastructure migration incomplete | Old tests not updated when DI was added   |
| Large test helper files       | Production code not composable      | Tests reimplementing domain construction  |
| Duplicate test coverage       | No integration test strategy        | Unit tests duplicating integration tests  |
| Tests in wrong layer          | Unclear layer boundaries            | Storage tests in CLI, board tests in sync |
| Console output in tests       | No debug() pattern awareness        | Tests not using proper debug tooling      |
| Slow unmarked tests           | No timing enforcement               | Database tests not marked .slow.test.ts   |
| Flaky tests                   | Race conditions or shared state     | Tests depend on filesystem timing         |
| Test setup complexity         | Missing factory composability       | Each test file has custom setup           |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Test infrastructure:**

- Add test-only utilities to reduce helper duplication (e.g., `withTestEnv` standard)
- Create shared fixtures package for common test data
- Document DI testing patterns with examples
- Add timing enforcement (fail if fast test >500ms)
- Create test templates for each layer

**Production code composability:**

- Refactor factories to be more composable (reduce test-only factory variants)
- Extract dependency injection patterns that simplify testing
- Make production code testable without extensive mocking
- Document testing strategy per layer in docs/

**Tooling enhancements:**

- Add pre-commit hook to check test:fast timing (<20s)
- Enforce DI compliance checks in CI (no getDb/setDb in tests)
- Add automated detection for tests in wrong layer
- Create lint rule for console.log in test files (should use debug())
- Add test coverage tracking (not just line coverage, but feature coverage)

**Documentation:**

- Document test pyramid strategy (unit vs integration vs chaos)
- Add examples of good test setup patterns per layer
- Create "Testing Checklist" for new features
- Document when to use .slow.test.ts vs regular tests

### 4. Self-Assessment

Evaluate test review effectiveness:

| Dimension      | Assessment                                           |
| -------------- | ---------------------------------------------------- |
| Coverage       | Did we check all test types and layers?              |
| Actionability  | Were recommendations clear and implementable?        |
| Impact         | Did changes improve test speed, clarity, or quality? |
| Safety         | Did deletions/merges maintain coverage?              |
| Timing         | Did we actually improve test:fast speed?             |
| False positive | How many flagged tests were actually valuable?       |

### 5. Metrics Tracking

Compare before/after:

| Metric                        | Before | After | Target |
| ----------------------------- | ------ | ----- | ------ |
| test:fast time                | Xs     | Ys    | <20s   |
| Total test files              | X      | Y     | -      |
| DI compliance violations      | X      | Y     | 0      |
| Unmarked slow tests           | X      | Y     | 0      |
| Console output in tests       | X      | Y     | 0      |
| Test helpers >150 lines       | X      | Y     | 0      |
| Tests deleted (obsolete)      | -      | Y     | -      |
| Tests merged (duplicate)      | -      | Y     | -      |
| Test setup refactors          | -      | Y     | -      |
| Production composability gaps | X      | Y     | 0      |

### 6. Create Process Improvement Beads (Optional)

For significant gaps identified:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Test infrastructure gap
bd create --id "km-proc-test-infra-$DATE_SUFFIX" --type=task --priority=2 \
  --title="Standardize test setup utilities" \
  --body="Create shared withTestEnv helpers to eliminate duplication across test files"

# Example: Production code gap
bd create --id "km-proc-factories-$DATE_SUFFIX" --type=task --priority=2 \
  --title="Refactor factories for test composability" \
  --body="Review found createTestX duplicating createX. Make production factories composable."

# Example: Tooling gap
bd create --id "km-proc-test-timing-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Add test timing enforcement to CI" \
  --body="Fail build if test:fast >5s to prevent regression"

# Example: Documentation gap
bd create --id "km-proc-test-docs-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Document test pyramid and layer testing strategy" \
  --body="Add docs/testing.md with examples for each layer's testing approach"
```

### 7. Update Test Review Workflow

If the review revealed gaps in this review process itself, consider updating [review-tests.md](review-tests.md):

**New checks to add:**

- Example: "Check for .only() or .skip() left in committed tests"
- Example: "Detect tests that import from parent directories (layer violation)"
- Example: "Find tests with >10 assertions (probably testing too much)"

**Phase improvements:**

- Example: "Phase 1.5 should also check for test timeouts being set appropriately"
- Example: "Phase 3 overlap detection should use AST analysis, not just line counts"
- Example: "Phase 4 should check for assertion library consistency (expect vs assert)"

**Smell detection refinements:**

- Example: "Test setup >50 lines is red flag, not just >150"
- Example: "Pure functions with database tests should suggest mock, not layer move"

Make edits directly to this file or create a process improvement bead.

**This creates a continuous feedback loop for test quality and infrastructure evolution.**

---

## Quick Checks

### Check for stray debug/repro test files

Ad-hoc test files created during debugging accumulate and slow down test:fast. Flag files with `repro`, `debug`, `profile`, `analysis`, `scratch` in their names:

```bash
echo "=== Stray debug/repro test files ==="
find apps/km-tui/tests packages/*/tests -name "*.test.ts" -o -name "*.spec.ts" | \
  grep -iE 'repro|debug|profile|analysis|scratch|temp|wip' | sort
```

**Triage each file:**
- **Bug is fixed** → delete the repro test (the regression test should exist separately)
- **Has lasting value** → rename without debug/repro suffix, make it a proper regression test
- **Needs real vault data** → rename to `.slow.test.ts` with `skipIf` guard
- **Has `console.log`** → either remove the output or move to `.slow.test.ts`

**Prevention**: When creating debug/repro tests during a session, add a comment `// TODO: delete after fixing <bead-id>` so future reviews catch them.

### Check test:fast timing

```bash
time bun run test:fast 2>&1 | tail -5
```

**Target: <15s wall-clock.** If >15s, something is wrong:
- Check for infinite loops (while + screenshot patterns)
- Check for stale vitest processes: `ps aux | grep vitest`
- Check for tests that should be `.slow.test.ts`
- Create P0 bead if regression is confirmed

### Check for stale vendor test fixtures

The Yoga layout tests in `vendor/flexily/tests/yoga/` are generated from Facebook's Yoga project.
These should be refreshed periodically to catch new test cases or Yoga behavior changes.

```bash
# Check when Yoga tests were last generated
ls -la vendor/flexily/tests/yoga/*.test.ts | head -5

# Check latest Yoga release (compare against last import)
curl -s https://api.github.com/repos/facebook/yoga/releases/latest | grep tag_name
```

**When to re-import:**

- When Yoga releases a new version (especially major/minor versions)
- If Flexily layout behavior seems incorrect but tests pass
- Periodically (e.g., quarterly) during test reviews

**How to re-import:**

```bash
cd vendor/flexily
bun scripts/import-yoga-tests.ts
bun test tests/yoga/  # Verify tests pass
```

**Source**: https://github.com/facebook/yoga/tree/main/gentest/fixtures

If tests fail after re-import, either:
1. Flexily has a layout bug that needs fixing
2. Yoga changed expected behavior (check release notes)

### Check chaos test coverage

```bash
# List chaos scenarios
grep -r "name:" packages/km-storage/tests/sync/chaos/scenarios.ts
```

### Check for Playwright test issues

```bash
# Playwright tests using hardcoded ports (should use dynamic)
grep -r "7681" apps/km-tui/tests/*.playwright.ts
```

### Check for layer violations (CI candidate)

These checks from Phase 3.8 could be automated as a CI lint step to continuously enforce layering:

```bash
# Fail CI if km-tui tests import km-markdown directly (should go through km-board/km-storage)
echo "=== Direct parser imports in TUI tests ==="
grep -l "from.*@km/markdown\|from.*km-markdown" apps/km-tui/tests/*.test.ts apps/km-tui/tests/*.spec.ts 2>/dev/null

# Fail CI if .only() is left in committed tests
echo "=== Stale .only() calls ==="
grep -rn "\.only(" apps/*/tests/*.test.ts apps/*/tests/*.spec.ts packages/*/tests/*.test.ts 2>/dev/null | grep -v node_modules
```

### Check for slow tests not marked `.slow`

```bash
# Tests with database access not marked slow
grep -l "Database\|createVault\|withTestEnv" packages/*/tests/*.test.ts 2>/dev/null | \
  grep -v ".slow.test.ts"

# mdspec files that should be marked slow (taking >1s per test)
# Note: .spec.md files now follow the same slow/fast convention as .test.ts
# Use .slow.spec.md suffix for slow mdspec files
```

**Keywords**: test review, prune tests, test cleanup, test organization, test audit, test smell, test pyramid, chaos testing, playwright
