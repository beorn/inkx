---
description: Review and prune test suite for overlap, speed, and organization
argument-hint: [package | --full | --dry-run]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Test Review

Review tests for pruning, overlap, and architecture alignment.

**Target**: $ARGUMENTS
**Reference**: See `docs/dev/test-review.md` for full checklist and guidelines.

## Modes

| Argument | Behavior |
|----------|----------|
| (none) | Review all tests, output report |
| `<package>` | Review specific package (e.g., `km-storage`) |
| `--full` | Include detailed taxonomy of every test |
| `--dry-run` | Analysis only, no action recommendations |

---

## Phase 1: Inventory

Run in parallel to count tests:

```bash
# Test file counts by type
echo "=== Test File Counts ==="
echo "Fast unit: $(find packages apps -name '*.test.ts' ! -name '*.slow*' ! -name '*.playwright*' 2>/dev/null | wc -l)"
echo "Slow integration: $(find packages apps -name '*.slow.test.ts' 2>/dev/null | wc -l)"
echo "Playwright: $(find packages apps -name '*.playwright.ts' 2>/dev/null | wc -l)"
echo "mdtest: $(find packages apps tests -name '*.test.md' 2>/dev/null | wc -l)"
echo "Chaos: $(find packages -path '*/chaos/*.test.ts' 2>/dev/null | wc -l)"

# Tests per package
echo -e "\n=== Tests by Package ==="
for dir in packages/*/tests apps/*/tests; do
  [ -d "$dir" ] && echo "$dir: $(grep -r 'test(\|it(' "$dir" 2>/dev/null | wc -l) tests"
done
```

For `--full`, also generate taxonomy:

```bash
# Detailed file listing
find packages apps -name "*.test.ts" -o -name "*.slow.test.ts" -o -name "*.test.md" | \
  xargs wc -l 2>/dev/null | sort -n | tail -30
```

## Phase 2: Layer Analysis

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

## Phase 4: Smell Detection

Apply checklist from `docs/dev/test-review.md`:

**Delete candidates**:
- Tautology tests
- Tests the mock
- Obsolete features
- Flaky tests
- Covered by types

**Merge candidates**:
- Same setup, different assertions
- Sequential dependencies

**Move layer candidates**:
- >10 mocks → move up
- Pure function with database → move down

## Phase 5: Report

Output structured findings:

```markdown
## Test Review: YYYY-MM-DD

### Summary
| Metric | Count |
|--------|-------|
| Total test files | N |
| Total tests | N |
| Fast tests | N |
| Slow tests | N |
| Playwright tests | N |
| Chaos tests | N |
| Delete candidates | N |
| Merge candidates | N |

### By Layer
| Layer | Files | Tests | Issues |
|-------|-------|-------|--------|

### Action Items
#### A. Delete (N)
| File:Line | Test | Reason |

#### B. Merge (N)
| Source | Into | Reason |

#### C. Move (N)
| File:Line | From | To | Reason |
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

---

## Quick Checks

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

### Check for slow tests not marked `.slow`

```bash
# Tests with database access not marked slow
grep -l "Database\|createVault\|withTestEnv" packages/*/tests/*.test.ts 2>/dev/null | \
  grep -v ".slow.test.ts"
```

**Keywords**: test review, prune tests, test cleanup, test organization, test audit, test smell, test pyramid, chaos testing, playwright
