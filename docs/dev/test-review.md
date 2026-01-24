# Test Review Guide

Reference for reviewing, pruning, and organizing the km test suite.

**Command**: Use `/test-review` to run a systematic review.

---

## Test Types Overview

| Suffix            | Location                     | Speed  | Purpose                            |
| ----------------- | ---------------------------- | ------ | ---------------------------------- |
| `.test.ts`        | `packages/*/tests/`          | Fast   | Core tests (logic, domain objects) |
| `.slow.test.ts`   | `packages/*/tests/`          | Medium | Slow tests (sync, multi-component) |
| `.test.md`        | `apps/km-cli/tests/sh/`      | Medium | CLI acceptance tests (mdtest)      |
| `.playwright.ts`  | `apps/km-tui/tests/`         | Slow   | Visual TUI tests (deprecated)      |
| `sync/chaos/*.ts` | `packages/km-storage/tests/` | Slow   | Property-based sync fuzzing        |

## Test Distribution

| Layer                   | Target % | Test Focus               | Database?      |
| ----------------------- | -------- | ------------------------ | -------------- |
| Parser (`@km/markdown`) | ~5%      | Parse/serialize logic    | No             |
| Storage (`@km/storage`) | ~40%     | Domain + Sync + Chaos    | Yes (isolated) |
| Tree (`@km/tree`)       | ~5%      | Query logic              | No             |
| Board (`@km/board`)     | ~15%     | State machine (fixtures) | No             |
| TUI (`apps/km-tui`)     | ~20%     | Acceptance + mdtest      | No             |
| CLI (`apps/km-cli`)     | ~15%     | Acceptance (mdtest)      | Yes            |

**Health check**: Fast tests (~24s) should catch 90% of regressions. Slow tests for edge cases only.

---

## Layer Testing Rules

### Parser Layer (`@km/markdown`)

| Should Test                               | Should NOT Test                           |
| ----------------------------------------- | ----------------------------------------- |
| Parse constructs (tasks, headings, lists) | Storage operations                        |
| Round-trip preservation                   | UI rendering                              |
| Edge cases & malformed input              | Node conversion (belongs in tree/storage) |
| Property extraction                       | Filesystem operations                     |

**Pattern**: Pure functions, inline test content, no database.

### Storage Layer (`@km/storage`)

| Should Test                     | Should NOT Test   |
| ------------------------------- | ----------------- |
| CRUD operations via Vault API   | UI rendering      |
| Query parsing & evaluation      | Navigation state  |
| Sync correctness (file ↔ DB)    | Visual appearance |
| Event sourcing & replay         |                   |
| Node resolution & relationships |                   |

**Pattern**: Use `/tmp/kmtest-*` directories, `withTestEnv()` helpers, `using` for cleanup.

### Tree Layer (`@km/tree`)

| Should Test                               | Should NOT Test     |
| ----------------------------------------- | ------------------- |
| Tree queries (parent, children, siblings) | Storage mutations   |
| Display name formatting                   | UI components       |
| Path resolution                           | Database operations |

**Pattern**: Pure functions, no database.

### Board Layer (`@km/board`)

| Should Test                         | Should NOT Test         |
| ----------------------------------- | ----------------------- |
| Reducer actions & state transitions | Database operations     |
| Selectors & transformers            | React/Ink rendering     |
| Cursor navigation logic             | Keyboard input handling |
| Selection, fold, zoom state         |                         |

**Pattern**: Use fixtures (`createSimpleTestBoard()`), no SQLite, no file I/O.

### TUI Layer (`apps/km-tui`)

| Should Test                       | Should NOT Test          |
| --------------------------------- | ------------------------ |
| Component rendering (Ink)         | Direct storage mutations |
| Layout utilities (truncate, wrap) | Database queries         |
| Text formatting                   | File operations          |

**Pattern**: Ink testing library, mdtest for golden files.

### CLI Layer (`apps/km-cli`)

| Should Test         | Should NOT Test          |
| ------------------- | ------------------------ |
| Command handling    | Internal state details   |
| Full user workflows | Implementation specifics |
| Error messages      |                          |
| Output formatting   |                          |

**Pattern**: mdtest (`.test.md`) for golden file testing, integration tests for workflows.

---

## Special Test Types

### Chaos Testing (`packages/km-storage/tests/sync/chaos/`)

Property-based fuzzing for sync edge cases. **High value** - catches real bugs.

| File                      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `chaos.slow.test.ts`      | Main fuzzer with seeded random scenarios |
| `concurrent.slow.test.ts` | Concurrent read/write operations         |
| `db-to-fs.slow.test.ts`   | Database → filesystem sync               |
| `regression.test.ts`      | Known bug regression tests               |
| `roundtrip.test.ts`       | Parse → serialize → parse equivalence    |

**Chaos scenarios** (from `scenarios.ts`):

- Dropped events
- Reordered events
- Duplicate events
- Delayed events
- Race conditions

**When to add chaos tests**:

- New sync feature
- Bug found in production (add regression case)
- Complex state transitions

**When to delete chaos tests**:

- Never delete regression tests (they document real bugs)
- Prune only if superseded by broader scenario

### Playwright Tests (`apps/km-tui/tests/*.playwright.ts`)

Visual TUI testing via ttyd + chromium headless.

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `tui.playwright.ts`          | View switching, navigation, help overlay |
| `body-content.playwright.ts` | Body content rendering                   |

**Pattern**:

```typescript
test("should display cards view", async ({ page }) => {
  await page.goto("/"); // ttyd serves TUI
  await waitForTerminal(page);
  await takeDebugScreenshot(page, "01-initial");

  const content = await page.locator(".xterm-screen").textContent();
  expect(content).toContain("expected text");
});
```

**Status**: Deprecated - migrate to inkx `createTestRenderer()`.

**When reviewing Playwright tests**:

- Consider migrating to inkx (faster, more reliable)
- Keep only if testing pixel-perfect terminal rendering that inkx can't cover
- For keyboard navigation, use inkx + `stdin.write()` instead

**Preferred alternatives**:

- `inkx/testing` with `createTestRenderer()` for visual assertions
- `km sh` + mdtest for scripted TUI testing

### mdtest / `km sh` Tests (`apps/km-cli/tests/sh/*.test.md`)

Golden file testing for CLI and TUI state.

```markdown
# Navigation Test

$ echo -e "move_down\nstate" | km sh -r $PWD/vault @inbox.md

> MOVE_DOWN
> position: col=0 card=1
```

**When to use mdtest**:

- CLI command output validation
- TUI state transitions (via `km sh`)
- Reproducible, deterministic tests
- Easy to read and update

**When to add new mdtest**:

- New CLI command
- New TUI keybinding or behavior
- Bug regression (capture exact output)

---

## When to DELETE a Test

Delete if **ANY** of these apply:

| Criterion                      | Example                                         | Why Delete                      |
| ------------------------------ | ----------------------------------------------- | ------------------------------- |
| **Tautology**                  | Test logic mirrors implementation exactly       | No value - passes by definition |
| **Tests the mock**             | Assertions verify mock was called, not behavior | Tests infrastructure, not code  |
| **Obsolete feature**           | Tests code that no longer exists                | Dead code                       |
| **Flaky (>1% fail)**           | Random failures, timing-dependent               | Creates noise, erodes trust     |
| **Subset duplicate**           | Another test covers this AND more               | Redundant maintenance           |
| **Covered by types**           | Test validates what TypeScript ensures          | Compiler already checks         |
| **>30s without justification** | Slow test with no E2E value                     | Blocks development              |
| **Line hitter**                | Achieves coverage without meaningful assertions | False confidence                |

**Kent Beck's heuristic**: "I want the fewest possible system-level tests to give me the desired confidence."

---

## When to MERGE Tests

| Signal                           | Action                                              |
| -------------------------------- | --------------------------------------------------- |
| Same setup, different assertions | Combine into one test with multiple expects         |
| Sequential dependency            | Tests should be independent; merge if they aren't   |
| Many micro-assertions            | One behavior test is clearer than 10 tiny tests     |
| Overlapping fixtures             | 90%+ shared setup = merge or extract shared fixture |

---

## When to MOVE Layer

### Move DOWN (E2E → Integration → Unit)

Move down when:

- Test is slow but tests isolated logic
- External dependencies cause flakiness
- Launches browser/app just to test pure function
- Could run without database but currently uses one

### Move UP (Unit → Integration → E2E)

Move up when:

- > 50% of test is mock setup
- Tests implementation details (breaks on refactor)
- Tests boundaries between layers
- Tests configuration/wiring, not algorithm

---

## Test Smells Checklist

### Code Smells (visible in test code)

- [ ] **Obscure test**: Can't understand intent at a glance
- [ ] **Excessive setup**: >20 lines of arrangement before action
- [ ] **Hard-coded values**: Magic numbers/strings without explanation
- [ ] **Eager test**: Tests multiple behaviors in one test
- [ ] **Mystery guest**: Uses external files not visible in test
- [ ] **General fixture**: Shared fixture with irrelevant data for each test

### Behavior Smells (visible at runtime)

- [ ] **Fragile**: Breaks on unrelated changes
- [ ] **Slow**: >1s for unit, >10s for integration, >60s for E2E
- [ ] **Non-deterministic**: Different results on same code
- [ ] **Resource optimism**: Assumes external resources always available

### Mock Overuse

- [ ] **Testing the mock**: Assertions verify mock was called, not that behavior is correct
- [ ] **Mock setup > test logic**: More lines configuring mocks than testing
- [ ] **Deep mocking chains**: `mock.returns.mock.returns.mock`
- [ ] **Mocking value objects**: Mocking simple data structures

**Preference hierarchy** (from Google's testing guide):

1. Real implementation (preferred)
2. Fake (simplified real implementation)
3. Stub (returns canned responses)
4. Mock (verifies interactions - use sparingly)

---

## km-Specific Checks

### Domain Object Testing

- [ ] Use factory pattern (`createVault()`, not `new Vault()`)
- [ ] Use `using` for automatic cleanup (`using vault = ...`)
- [ ] Use dependency injection for mocking (`options.inject`), not global singletons
- [ ] Test via public API (Vault), not internal functions (`emit*`)

```typescript
// GOOD: Tests via domain object API
using vault = runGenerator(createVault(vaultDir));
vault.updateNode(id, { task_status: "done" });
expect(vault.getNode(id)!.task_status).toBe("done");

// BAD: Tests internal implementation
setDatabase({ applyEvent }); // Global singleton
emitNodeUpdated("user", id, { task_status: "done" }); // Internal function
```

### Layer Isolation

- [ ] Parser tests have no database
- [ ] Board tests use fixtures, not real SQLite
- [ ] Storage tests use isolated `/tmp/kmtest-*` directories
- [ ] No cross-layer testing (e.g., storage test checking UI state)

### Performance

- [ ] Fast tests (<100ms each) don't touch filesystem
- [ ] Slow tests marked with `.slow.test.ts`
- [ ] Chaos/property tests in dedicated `sync/chaos/` directory
- [ ] `test:fast` completes in <30 seconds

---

## Known Duplication (km-specific)

| Files                                                                            | Issue                        | Resolution                                           |
| -------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `vault.test.ts` + `node-crud.test.ts`                                            | Both test mutations          | Keep vault tests (public API), consolidate node-crud |
| `navigation.test.ts` + `cursor-navigation.test.ts` + `visual-navigation.test.ts` | Overlapping cursor logic     | Clarify ownership or merge                           |
| `markdown.test.ts`                                                               | Mixes parser + tree concerns | Split by layer                                       |

---

## Quick Decision Matrix

| Situation                           | Action              |
| ----------------------------------- | ------------------- |
| Test always passes, no assertions   | Delete              |
| Test mirrors code 1:1               | Delete or move up   |
| Test requires >10 mocks             | Move up or refactor |
| Test takes >5s, tests pure function | Move down           |
| Two tests with same coverage        | Merge or delete one |
| Test breaks on every refactor       | Delete or move up   |
| Test caught a real bug              | Keep, document why  |
| Flaky + low value                   | Delete              |
| Flaky + high value                  | Fix or move up      |
| Tests deprecated feature            | Delete              |

---

## Review Output Template

```markdown
## Test Review: YYYY-MM-DD

### Summary

| Metric            | Count |
| ----------------- | ----- |
| Total test files  | N     |
| Total tests       | N     |
| Fast tests        | N     |
| Slow tests        | N     |
| Delete candidates | N     |
| Merge candidates  | N     |
| Move candidates   | N     |

### By Layer

| Layer   | Files | Tests | Issues |
| ------- | ----- | ----- | ------ |
| Parser  | N     | N     |        |
| Storage | N     | N     |        |
| Tree    | N     | N     |        |
| Board   | N     | N     |        |
| TUI     | N     | N     |        |
| CLI     | N     | N     |        |

### Action Items

#### A. Delete (N tests)

| File:Line         | Test Name     | Reason           |
| ----------------- | ------------- | ---------------- |
| `path.test.ts:42` | "should do X" | Covered by types |

#### B. Merge (N pairs)

| Source        | Into                 | Reason        |
| ------------- | -------------------- | ------------- |
| `nav.test.ts` | `cursor-nav.test.ts` | Same coverage |

#### C. Move Layer (N tests)

| File:Line           | From    | To    | Reason                       |
| ------------------- | ------- | ----- | ---------------------------- |
| `vault.test.ts:100` | Storage | Board | Tests state, not persistence |

#### D. Refactor (N tests)

| File:Line         | Issue             | Suggested Fix           |
| ----------------- | ----------------- | ----------------------- |
| `sync.test.ts:50` | Excessive mocking | Use real implementation |
```

---

## Sources

This guide synthesizes:

- [Martin Fowler - The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [xUnit Patterns - Test Smells](http://xunitpatterns.com/TestSmells.html)
- [Google SWE Book - Test Doubles](https://abseil.io/resources/swe-book/html/ch13.html)
- [Software Testing Anti-patterns](https://blog.codepipes.com/testing/software-testing-antipatterns.html)
- [Kent Beck - Additional Testing After Refactoring](https://tidyfirst.substack.com/p/additional-testing-after-refactoring)
