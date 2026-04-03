# Testing Guide

A test system that is:

1. **Clear** - obvious what each test category does and when to use it
2. **Fast** - default to lightweight infrastructure, with option for real
3. **Documentation-like** - acceptance tests are concise enough to serve as specs
4. **Non-overlapping** - each test has a clear owner, no redundancy

> Tests exist to prevent user-visible regressions and architectural decay, not to maximize coverage.
> We prefer fewer, clearer tests with strong ownership over exhaustive suites.

---

## Test Infrastructure Rules

> **MANDATORY**: All tests use in-memory infrastructure by default.
> This ensures tests are fast, isolated, and can run in parallel.

### The Rule

| Resource   | Default           | Exception                                   |
| ---------- | ----------------- | ------------------------------------------- |
| Database   | `:memory:` SQLite | Worker thread tests (need disk for sharing) |
| Filesystem | `/tmp/kmtest-*`   | Never use real user paths                   |
| Watchers   | Mocks             | Worker thread integration tests             |
| State      | Injected via DI   | Never use `getDb()`, `getKmDir()`           |

### Why This Matters

1. **Speed** - Memory DB is 10-100x faster than disk
2. **Isolation** - Tests can run in parallel without conflicts
3. **Reliability** - No shared state = no flaky tests
4. **Cleanup** - withTestEnv handles teardown automatically

### Anti-Patterns (NEVER DO)

```typescript
// ❌ Global getter - shared state, can't parallelize
const db = getDb()

// ❌ Direct instantiation - who cleans this up?
const db = new Database("/path/to/db")

// ❌ Real filesystem path - affects user data
const repoPath = "/Users/beorn/myrepo"

// ❌ Real watcher - slow, flaky, non-deterministic
const syncManager = withSync({ useWorker: true, debounceFs: 0, debounceApply: 0, conflictStrategy: "last_write_wins" })(repo)
```

### Correct Patterns

```typescript
// ✅ DI via withTestEnv - in-memory DB, isolated /tmp
await withTestEnv(async ({ db, repo, repoDir }) => {
  // Test code here
})

// ✅ FakeRepo for state-only tests - no DB at all
const repo = createFakeRepo({ nodes: fixtures })

// ✅ Mock watcher for sync tests (use createTestSync helper in test files)
const syncManager = createTestSync(db, repoDir, { debounceFs: 0, debounceApply: 0, conflictStrategy: "last_write_wins" })
```

---

## File Naming Conventions

**Reserved for acceptance tests:**

- `.spec.ts` - TUI UI-level acceptance tests (board.spec.ts)
- `.spec.md` - CLI acceptance tests (mdspec)

**For unit/integration tests:**

- `.test.ts` - Fast unit/integration tests (<1s each)
- `.slow.test.ts` - Slow tests (heavy integration)
- `.fuzz.ts` - Fuzz/chaos tests (excluded from test:all, run via test:fuzz)
- `.spec.md` - mdspec CLI tests

| Suffix          | Purpose                   | Test Level | Included in         |
| --------------- | ------------------------- | ---------- | ------------------- |
| `.spec.ts`      | TUI acceptance (UI-level) | E2E        | test:fast, test:all |
| `.test.ts`      | Unit/integration tests    | Unit/Int   | test:fast, test:all |
| `.slow.test.ts` | Slow integration          | Int/E2E    | test:all only       |
| `.fuzz.ts`      | Fuzz/chaos tests          | Fuzz       | test:fuzz only      |
| `.spec.md`      | mdspec CLI tests          | E2E        | test:fast, test:all |
| `.slow.spec.md` | Slow mdspec CLI tests     | E2E        | test:all only       |

**Rule**: Use `.spec.ts` ONLY for acceptance tests (board UI-level, CLI workflows). All other tests use `.test.ts`.

---

## Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              1. ACCEPTANCE TESTS                            │
│         (end-user visible, documentation-like)              │
├──────────────────────────┬──────────────────────────────────┤
│  VISUAL (TUI)            │  CLI                             │
│  Silvery createRenderer│  mdspec (.spec.md)                 │
│  + InkxLocator           │                                  │
│  - Screen coordinates    │  - Command output                │
│  - Representative fixtures│ - Error messages                │
│  - Keyboard navigation   │  - Workflows                     │
└──────────────────────────┴──────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              2. CORE TESTS                                  │
│         (per layer, per domain object)                      │
├─────────────────────────────────────────────────────────────┤
│  DOMAIN TESTS            │  LOGIC TESTS                     │
│  - Repo: CRUD, queries   │  - Parser: parse/serialize       │
│  - Board: state machine  │  - Tree: queries, formatting     │
│  - Config: loading       │  - Formatters, validators        │
├──────────────────────────┼──────────────────────────────────┤
│  VENDOR (git submodules) │  (tests in vendor/*/,            │
│  - Silvery, Flexily, logger│   included in test:fast)         │
└──────────────────────────┴──────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              3. SYNC TESTS (special)                        │
├──────────────────────────┬──────────────────────────────────┤
│  CHAOS FUZZER            │  REGRESSION TESTS                │
│  - Property-based        │  - Known bugs (never delete)     │
│  - Find new bugs         │  - Run automatically             │
│  - Run occasionally      │  - Fast                          │
└──────────────────────────┴──────────────────────────────────┘

ALL TESTS: Default lightweight (memory/mocks) + flag for real infra
```

---

## 1. Acceptance Tests

End-user visible tests that serve as documentation. A new developer should understand system behavior by reading these tests.

### 1.1 TUI Spec Tests

**Framework**: `Silvery/testing` with `testEnv()` helper from `board-test.ts`

**Location**: `apps/km-tui/tests/*.spec.ts`

**Purpose**: UI acceptance tests that verify end-user visible behavior. Spec tests are executable requirements.

**Organization**:

- ONE file: `board.spec.ts` - All UI acceptance tests
- Combines structural (CSS selectors), visual (boundingBox), and interaction tests
- Organized by feature/behavior using describe blocks

**Pattern**: Tree fixtures + CSS selectors + fluent API (inspired by decker's Playwright tests)

**Example - Structural test (DOM hierarchy):**

```typescript
test("node shifting (move to different column)", () => {
  const { board } = testEnv(() =>
    item(
      "board",
      item("col1", item("1a"), item("1b")),
      item("col2", item("2a")),
    ),
  )

  // BEFORE: 1a is child of col1
  board.expect("#col1 > #1a").toExist()
  board.expect("#1a + #1b").toExist() // 1a before 1b

  // Move 1a to col2
  board.press("m").press("l").press("\r")

  // AFTER: 1a is now child of col2
  board.expect("#col2 > #1a").toExist()
  board.expect("#col1 > #1a").not.toExist()
})
```

**Example - Visual layout test (position/spacing):**

```typescript
test("columns are horizontal", () => {
  const { board } = testEnv(() =>
    item("board", item("col1", item("1a")), item("col2", item("2a"))),
  )

  const col1Box = board.q("#col1").boundingBox()
  const col2Box = board.q("#col2").boundingBox()

  // col2 is to the right of col1
  expect(col2Box.x).toBeGreaterThan(col1Box.x)
  // Both columns aligned top
  expect(col2Box.y).toBe(col1Box.y)
})
```

**Fixture pattern** (decker-inspired):

- **Tree builder** - `item()` creates nested hierarchy
- **Content as ID** - "1a", "1b", "2a" are self-documenting
- **Inline fixtures** - passed directly to `testEnv()`
- No manual parent_id/parent_idx bookkeeping

**Test API**:

- `board.press(key)` - keyboard input with Playwright-style names (chainable)
- `board.expect(selector)` - fluent assertions
- `board.q(selector)` - advanced queries (returns InkxLocator)
- `.toExist()` / `.toHaveCount(n)` - custom matchers
- `.boundingBox()` - visual position checks
- `board._result.debug()` - print component tree for debugging

**CSS selectors**:

- `#col1 > #1a` - 1a is direct child of col1
- `#1a + #1b` - 1b immediately follows 1a
- `#1a[data-cursor]` - cursor is on 1a
- `[data-selected]` - all selected items
- `[data-view="card"]` - all cards

**Keyboard input (Playwright-style)**:

Use Playwright-style key names instead of raw ANSI escape codes:

```typescript
// Navigation keys
board.press("ArrowDown") // Instead of "\x1b[B"
board.press("ArrowUp") // Instead of "\x1b[A"
board.press("Enter") // Instead of "\r"
board.press("Escape") // Instead of "\x1b"
board.press("Tab") // Instead of "\t"

// Modifier combinations
board.press("Control+c") // Ctrl+C

// Single characters work as-is
board.press("j") // vim-style down
```

**Custom matchers for InkxLocator**:

```typescript
import { createLocator } from "Silvery/testing"

const locator = createLocator(result.getContainer())
const col1 = locator.getByTestId("col1")

// Text and visibility
expect(col1).toHaveText("To Do")
expect(col1).toBeVisible()

// Layout assertions
expect(col1).toBeLeftOf(col2)
expect(header).toBeAbove(content)
expect(card).toBeContainedIn(column)
expect(col1).toHaveWidth(20)
```

**Key benefits**:

- Tests read like documentation
- Inline fixtures show hierarchy visually
- CSS selectors test structure declaratively
- Auto re-render after each action
- Works at UI level (rendered DOM), not internal state

**Spec vs Unit Tests**:

- `.spec.ts` - UI acceptance tests using `stdin.write()` (full command system)
- `.test.ts` - Unit tests can use `handleKey()` directly (faster, focused)
- Both are valid - use the right tool for the test level

### 1.2 CLI Tests (mdspec)

**Framework**: mdspec (`.spec.md` files) with km-repl plugin

**Location**: `apps/km-cli/tests/sh/`

**Pattern**: In-process execution with memory database for fast tests.

#### Configuration (REQUIRED)

```yaml
---
mdspec:
  plugin: ../km-repl.ts
  fixture: two-columns
  memory: true # ← CRITICAL: Use in-memory database
---
```

**The `memory: true` flag is required for fast tests.** Without it:

- Uses disk database
- 16x slower (190ms vs 12ms per command)
- Creates unnecessary I/O

#### Example Test

```markdown
# Navigation Test

## Setup

$ km sync
✓ Synced ...

## Test

$ km sh board.md -c 'j; state'
cursor: [1]
```

#### How It Works

1. km-repl plugin creates isolated `/tmp/kmtest-*` directory
2. `memory: true` sets `KM_DB_PATH=:memory:` environment
3. `executeKmCommand()` runs km commands in-process (no subprocess)
4. Plugin cleans up temp directory after all tests

#### When to Use Subprocess Instead

Use subprocess (`$ bun km ...`) only when testing:

- CLI exit codes
- Environment variable handling
- Actual binary execution

These tests should be in separate slow test files.

**Doctrine:** mdspec asserts semantic output, not formatting or layout. Don't assert spacing, ANSI colors, or cursor position in mdspec.

---

## 2. Core Tests

Per-layer, per-domain-object tests. Fast, isolated, use mocks by default.

### 2.1 Test Isolation with `withTestEnv`

Tests requiring database access use `withTestEnv` for isolated environments:

```typescript
import { withTestEnv } from "@km/storage"

test("creates node", async () => {
  await withTestEnv(async ({ db, repoDir, kmDir }) => {
    // Each test gets:
    // - Unique /tmp/kmtest-{ulid}/ directory
    // - Fresh in-memory SQLite database
    // - Isolated AsyncLocalStorage contexts
    createTask(db, "Test task")
    expect(getNode(taskId)).toBeDefined()
  })
  // Cleanup automatic: db closed, temp dirs removed
})
```

**What `withTestEnv` provides**:

| Property  | Description                                   |
| --------- | --------------------------------------------- |
| `repo`    | Repo-like object wrapping DB-bound singletons |
| `db`      | In-memory SQLite with schema initialized      |
| `repoDir` | Isolated `/tmp/kmtest-{id}/repo/`             |
| `kmDir`   | Isolated `/tmp/kmtest-{id}/repo/.km/`         |
| `testId`  | Unique ULID for this test                     |

The `repo` object provides these methods (typed as `TestRepo`):

- `getNode`, `getChildren`, `getChildCountsBatch`
- `getBacklinks`, `getAncestors`, `getLinksTo`
- `moveNode`, `updateNode`, `deleteNode`, `addNode`
- `rawQuery` for direct SQL access

**Standard usage** (most tests):

```typescript
test("builds board from nodes", async () => {
  await withTestEnv(async ({ repo, repoDir }) => {
    // Create test data
    const rootId = createTestNode("board", "Test Board")

    // Pass repo to functions that need DB access
    const state = buildBoardState(repo as Repo, rootId)
    expect(state.columns).toHaveLength(2)
  })
})
```

**Custom fixture** (when you need different behavior):

For Ink component tests that don't need real DB operations, use `createFakeRepo()`:

```typescript
test("renders board component", async () => {
  // createFakeRepo() returns an isolated in-memory repo
  const fakeRepo = createFakeRepo();

  const { lastFrame } = render(
    <InkBoard repo={fakeRepo} initialState={state} />
  );

  expect(lastFrame()).toContain("Task 1");
});
```

**When to use which**:

| Scenario                                           | Fixture                    |
| -------------------------------------------------- | -------------------------- |
| Tests calling `buildBoardState`, `handleKey`, etc. | `withTestEnv` → `env.repo` |
| Ink component rendering (no DB mutations)          | `createFakeRepo()`         |
| Pure function tests (no DB)                        | None needed                |

**When NOT to use withTestEnv**:

- Pure function tests (no DB needed)
- Tests using `createFakeRepo()` (already isolated)

### 2.2 Domain Object Tests

Each domain object gets its own test file testing the **public API**:

| Domain Object | Test File        | What to Test                     |
| ------------- | ---------------- | -------------------------------- |
| `Repo`        | `repo.test.ts`   | CRUD, queries, lifecycle         |
| `Board`       | `board.test.ts`  | State machine, reducers, actions |
| `Config`      | `config.test.ts` | Loading, validation, defaults    |

**Pattern**: Factory functions, `using` for cleanup, DI for mocks.

```typescript
test("creates node", () => {
  using repo = runGenerator(createRepo(testDir))
  repo.addNode(parentId, { type: "task", content: "New task" })
  expect(repo.getNode(id)).toBeDefined()
})
```

### 2.3 Pure Function Tests

Per-layer tests for pure logic (no database, no I/O):

**Parser Layer** (`@km/markdown`):

- [markdown.test.ts](../../packages/km-markdown/tests/markdown.test.ts) - Parse markdown constructs
- [roundtrip.test.ts](../../packages/km-markdown/tests/roundtrip.test.ts) - Serialize and re-parse
- [properties.test.ts](../../packages/km-markdown/tests/properties.test.ts) - Property-based parsing
- [properties-roundtrip.test.ts](../../packages/km-markdown/tests/properties-roundtrip.test.ts) - Property-based roundtrip

**Tree Layer** (`@km/tree`):

- [body.test.ts](../../packages/km-tree/tests/body.test.ts) - Body text extraction
- [display.test.ts](../../packages/km-tree/tests/display.test.ts) - Display name generation
- [queries.test.ts](../../packages/km-tree/tests/queries.test.ts) - Tree queries (ancestors, descendants)

**Board Layer** (`@km/board`):

- [selectors.test.ts](../../packages/km-board/tests/selectors.test.ts) - Derived state calculations
- [node-map.test.ts](../../packages/km-board/tests/node-map.test.ts) - Node indexing
- [transformers.test.ts](../../packages/km-board/tests/transformers.test.ts) - State transformations

### 2.4 Vendor Tests

Vendor packages (`vendor/*`) are git submodules - part of km's test suite.

**Test location:** Tests live in each vendor package (e.g., `vendor/silvery/tests/`).

**Included automatically:** `test:fast` and `test:all` discover and run vendor tests.

**Rule:** km packages (`packages/`, `apps/`) must not contain component-level render/layout tests. Component behavior is validated via acceptance tests or vendor tests.

### 2.5 Utility Tests

**TUI Layout** (`apps/km-tui/tests/layout/`):

- [constrain.test.ts](../../apps/km-tui/tests/layout/constrain.test.ts) - Width constraint logic
- [path.test.ts](../../apps/km-tui/tests/layout/path.test.ts) - Path formatting
- [truncate.test.ts](../../apps/km-tui/tests/layout/truncate.test.ts) - Text truncation
- [wrap.test.ts](../../apps/km-tui/tests/layout/wrap.test.ts) - Text wrapping

**TUI Text** (`apps/km-tui/tests/text/`):

- [icons.test.ts](../../apps/km-tui/tests/text/icons.test.ts) - Icon rendering
- [rich.test.ts](../../apps/km-tui/tests/text/rich.test.ts) - Rich text formatting

### 2.6 Other Package Tests

Each package has focused unit tests:

| Package             | Test Files | Focus Area                   |
| ------------------- | ---------- | ---------------------------- |
| km-commands         | 5          | Command system, keybindings  |
| km-agent            | 4          | Agent harness, mutations     |
| km-beads            | 3          | Issue tracking, dependencies |
| km-connector-caldav | 5          | CalDAV/CardDAV sync          |
| km-core             | 4          | Query parser, types          |

---

## 3. Sync Tests

### 3.1 Chaos Fuzzer

**Purpose**: Find new sync bugs via property-based testing.

**Location**: `packages/km-storage/tests/sync/chaos/`

**When to run**: Occasionally (not every commit), when changing sync code.

**Scenarios**: Dropped events, reordering, duplicates, race conditions.

See [chaos-testing.md](chaos-testing.md) for detailed reference.

### 3.2 Regression Tests

**Purpose**: Prevent re-introduction of known bugs.

**Rules:**

- NEVER delete regression tests - they document real bugs
- Each regression test must reference the original issue or commit

**When to run**: Always (part of `test:fast`).

### 3.3 E2E Safety Tests

**Purpose**: Verify sync never corrupts non-markdown files.

**Location**: `packages/km-storage/tests/e2e/`

**Files**: [sync-safety.test.ts](../../packages/km-storage/tests/e2e/sync-safety.test.ts) (5 tests)

**When to run**: Always (part of `test:fast`).

**Context**: After km-me0n incident where sync overwrote source files, these tests ensure sync only touches `.md` files.

---

## TEST_MODE

Controls test infrastructure via environment variable.

| Mode      | Database | When to Use                    |
| --------- | -------- | ------------------------------ |
| (default) | :memory: | Normal development             |
| `mock`    | :memory: | Reserved for future skip logic |
| `real`    | Disk     | CI, releases, drift detection  |

All modes use `/tmp/kmtest-*` filesystem. The difference is database type.

**Usage**:

```bash
bun run test:fast                     # Default (memory DB)
TEST_MODE=real bun run test:all       # Disk DB, full infrastructure
```

> **Note**: `isMockMode()` and `isRealMode()` are exported but currently unused. They're reserved for future optimization where slow tests could skip via `test.skipIf(isMockMode())`. Currently, all tests run in all modes.

**Drift detection**: Run `TEST_MODE=real bun run test:all` periodically to catch when in-memory behavior diverges from disk behavior.

**Fakes vs TEST_MODE**: TEST_MODE controls the database type in `withTestEnv()`. Behavioral fakes like `createFakeRepo()` work independently of TEST_MODE. See [test-fakes.md](test-fakes.md) for the full fakes inventory.

---

## Dynamic Testing Taxonomy

This section maps km's testing tools to industry-standard terminology, helping developers choose the right testing approach.

### Industry Classification

| Category             | Industry Term        | km Implementation              | Surface             |
| -------------------- | -------------------- | ------------------------------ | ------------------- |
| Fault Injection      | Chaos Engineering    | `/chaos`, `chaos-testing.md`   | Filesystem sync     |
| Monkey Testing       | Exploratory Testing  | `/explore`, `explore-tui.ts`   | TUI (keyboard)      |
| Differential Testing | Oracle-Based Testing | Flexily fuzz vs Yoga             | Layout engine       |
| Property-Based       | Invariant Checking   | Both chaos + explore           | Invariants          |
| Acceptance Testing   | E2E Testing          | mdspec, Silvery specs          | CLI, TUI            |

### Exploration Testing (Unified Pattern)

All exploration tests follow the same pattern:
**Generate inputs → Apply to system → Check invariants → Reproduce failures**

| Test Suite  | Surface   | Input Generator      | Invariants                          | Reproduction |
| ----------- | --------- | -------------------- | ----------------------------------- | ------------ |
| Sync Chaos  | FS events | 11 chaos scenarios   | noDuplicates, noOrphans, syncMatch  | Seeded RNG   |
| TUI Explore | Keyboard  | Weighted random keys | singleCursor, validView, noErrors   | Seeded RNG   |
| Flexily Fuzz  | Layout    | Random node trees    | Yoga equivalence                    | Seeded RNG   |

### Full Taxonomy Tree

```
Dynamic Testing
├── Functional
│   ├── Acceptance (mdspec, Silvery specs) → verifies user-visible behavior
│   ├── Regression (preserved failing tests) → prevents re-introduction
│   └── Smoke (quick sanity) → fast CI gate
├── Exploration
│   ├── Fault Injection (chaos/) → sync resilience
│   ├── Monkey Testing (/explore) → UI stability
│   └── Differential (Flexily fuzz) → layout correctness
└── Performance
    ├── Benchmarks (vitest bench) → track regressions
    └── Profile-Guided → manual optimization
```

### What We Don't Have (Yet)

| Type                    | Description                     | Could Add               |
| ----------------------- | ------------------------------- | ----------------------- |
| Coverage-Guided Fuzzing | AFL-style mutation              | For parser layer        |
| Load Testing            | High volume concurrent ops      | For sync layer          |
| Soak Testing            | Long-running stability          | CI nightly job          |
| Mutation Testing        | Stryker-style code mutation     | Test quality metric     |

### See Also

- [chaos-testing.md](chaos-testing.md) — Filesystem sync chaos testing
- [.claude/skills/explore/](../../.claude/skills/explore/) — TUI exploration skill
- [vendor/flexily/](../../vendor/flexily/) — Layout engine with Yoga differential tests

---

## Testing Categories

### TUI Tests (Silvery)

Fast, character-based testing for components:

```typescript
import { createRenderer, createLocator, keyToAnsi } from "Silvery/testing";

const render = createRenderer({ cols: 80, rows: 24 });
const { lastFrameText, getContainer, stdin, debug } = render(<Board {...props} />);

// Text assertions
expect(lastFrameText()).toContain("Task 1");

// DOM-like queries with position
const locator = createLocator(getContainer());
const task = locator.getByTestId("task-1");
expect(task.boundingBox()?.x).toBe(10);

// Keyboard input (Playwright-style key names)
stdin.write(keyToAnsi("ArrowDown")); // Move down
stdin.write(keyToAnsi("Enter"));     // Confirm
stdin.write("j");                     // Single chars work directly

// Debug output (prints component tree to console)
debug();
```

### Method 2: `km screenshot` (Debugging Only)

Quick capture of current TUI state for **manual inspection**. Not for automated testing - you can't send keystrokes programmatically.

```bash
km screenshot /path/to/repo --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

**When to use**: Debugging visual issues, sharing TUI state in bug reports.

**Not for**: Automated tests (use Silvery test renderer instead).

### GUI Tests (ttyd + Playwright)

Pixel-perfect terminal rendering via browser. Use only when you need to see the final rendered output - not for automated tests (`bun test:all`).

```bash
# Ad-hoc visual inspection
TTYD_PORT=$((7700 + RANDOM % 300))
ttyd -W -p $TTYD_PORT bun km view /tmp/repo &
sleep 3
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:$TTYD_PORT /tmp/screenshot.png
pkill -f ttyd
```

---

## Quick Reference

### Workflows

**Coding Iteration** (every change):

```bash
bun vitest run --changed              # Fastest: only tests affected by your changes
bun vitest related src/foo.ts         # Tests importing a specific file
bun vitest run apps/km-tui/tests/     # All tests in a directory
```

**Before Commit**:

```bash
bun fix                    # Lint + format (must pass)
bun run test:all           # Full suite (must pass)
```

**Working on Specific Areas**:

| Working on...        | Run during iteration                    |
| -------------------- | --------------------------------------- |
| Specific changes     | `bun vitest run --changed`              |
| Specific file        | `bun vitest related src/foo.ts`         |
| Sync, watcher, chaos | `bun run test:slow`                     |
| Broad non-vendor     | `bun run test:fast`                     |

Still run `test:all` before commit.

**CI / Release**:

```bash
TEST_MODE=real bun run test:all   # Disk DB, full infrastructure
```

### File Naming

| Suffix          | Purpose                         | Included in         |
| --------------- | ------------------------------- | ------------------- |
| `.test.ts`      | Fast tests (<1s each)           | test:fast, test:all |
| `.slow.test.ts` | Slow tests (integration)        | test:all only       |
| `.fuzz.ts`      | Fuzz/chaos tests                | test:fuzz only      |
| `.spec.ts`      | TUI acceptance tests            | test:fast, test:all |
| `.spec.md`      | mdspec CLI tests                | test:fast, test:all |
| `.slow.spec.md` | Slow mdspec CLI tests           | test:all only       |

### Test File Guidelines

**File Size:**

- Target: <500 lines per file for maintainability
- Warning: Files >500 lines should be considered for splitting by logical concerns
- Action: Files >1500 lines should be split (see [test-quality-report.md](test-quality-report.md))

**Test Syntax:**

- Prefer `test()` over `it()` for consistency across the codebase
- Use `describe()` to organize related tests into logical groups

**Organization:**

- Group related tests with `describe()` blocks
- Test files should focus on a single logical concern
- Example: `query-filters.test.ts`, `query-execution.test.ts` > one monolithic `query.test.ts`

### Test Commands

| Command       | What it runs                                          | Use case          |
| ------------- | ----------------------------------------------------- | ----------------- |
| `test:fast`   | Default project (excludes `*.slow.*` and `vendor/**`) | Default iteration |
| `test:slow`   | `--project slow` — `*.slow.{test,spec}.*` only        | Slow tests only   |
| `test:vendor`  | `--project vendor` — vendor tests only               | Vendor isolation  |
| `test:all`    | All 3 projects (default + slow + vendor)              | Before commit     |
| `test:fuzz`   | `FUZZ=1` — `*.fuzz.ts` files only                     | Exploratory testing |

**Primary workflow**: `test:fast` (iterate) → `test:all` (commit)

### When to Use What

| Testing Need             | Use This                | Not This         |
| ------------------------ | ----------------------- | ---------------- |
| TUI rendering/navigation | Silvery createRenderer | Playwright       |
| CLI command output       | mdspec (.spec.md)       | Unit test        |
| Domain object behavior   | Unit test with DI       | Integration test |
| Pure function logic      | Unit test               | mdspec           |
| Sync edge cases          | Chaos tests             | More unit tests  |
| Visual debugging         | `km screenshot`         | Peekaboo         |

### Decision Tree

```
Is it end-user visible behavior?
├── Yes, TUI → Visual acceptance test (Silvery)
├── Yes, CLI → mdspec (.spec.md)
└── No
    ├── Is it a domain object? → Unit test (factory, DI)
    ├── Is it a pure function? → Unit test
    └── Is it sync/watch? → Chaos or regression test
```

### Terminology Choices

- **"Acceptance" not "e2e"** - e2e is overloaded; we reserve `e2e/` for critical safety tests
- **"Core Tests" not "Unit/Integration"** - speed (fast/slow) is our organizing principle, not test type
- **No "integration" in filenames** - the `.slow.test.ts` suffix handles this

---

## Debugging TUI Issues

See [debugging.md](debugging.md) for the full debugging workflow.

---

## Performance Verification

### Speed Targets

| Suite     | Target | Rationale                |
| --------- | ------ | ------------------------ |
| test:fast | ~11s   | Developer iteration loop |
| test:all  | <2min  | Pre-commit full check    |

### Check for Violations

```bash
# Run performance analysis
bun run test:perf

# Find slow tests not marked .slow
bun run test:perf 2>&1 | grep -E "^\s+[0-9]+\." | awk '$2 > 1'

# Find tests using deprecated singletons
grep -r "getDb()" packages/*/tests/*.test.ts

# Find tests creating raw Database
grep -r "new Database" packages/*/tests/*.test.ts | grep -v ".slow."

# Find mdspecs without memory: true
grep -L "memory: true" apps/km-cli/tests/sh/*.spec.md
```

### File Naming Rules

Tests taking >1s MUST be marked `.slow.test.ts`:

| Time | Action                                        |
| ---- | --------------------------------------------- |
| <1s  | Keep as `.test.ts`                            |
| 1-5s | Consider optimization or mark `.slow.test.ts` |
| >5s  | MUST be `.slow.test.ts`                       |

---

## Test Output Rules

**Strict enforcement**: Tests must be completely silent on success. Any output to stdout/stderr fails the test.

This is enforced by [`tests/fail-on-console.ts`](../../tests/fail-on-console.ts), a preload script that:

1. Intercepts `console.log`, `console.info`, `console.debug`
2. Intercepts `process.stdout.write` and `process.stderr.write`
3. Fails the test if any output is produced

### If Your Test Needs to Produce Output

**Testing code that logs**: Spy on the console method:

```typescript
import { spyOn } from "bun:test"

test("logs on dry-run", () => {
  const spy = spyOn(console, "log").mockImplementation(() => {})

  runDryRun()

  expect(spy).toHaveBeenCalledWith(expect.stringContaining("Would create"))
  spy.mockRestore()
})
```

**Testing code that writes to stdout**: Capture output:

```typescript
test("shows progress", () => {
  const output: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any) => {
    output.push(String(chunk))
    return true
  }) as typeof process.stdout.write

  runProgressOperation()

  expect(output.join("")).toContain("Processing...")
  process.stdout.write = original
})
```

**Debugging**: Temporarily disable output checking:

```bash
SKIP_OUTPUT_CHECK=1 bun test path/to/test.ts
```

### What Gets Caught

| Source                   | Example              | How to Fix         |
| ------------------------ | -------------------- | ------------------ |
| `console.log()`          | Debug statements     | Remove or spy      |
| `process.stdout.write()` | Progress bars        | Capture in test    |
| Node warnings            | MaxListenersExceeded | Fix the root cause |
| Production logging       | `logger.info()`      | Inject mock logger |

### What Doesn't Get Caught

- `console.error()` / `console.warn()` - These indicate real problems and should be visible
- Terminal control sequences (ANSI codes, bell) - Filtered as non-meaningful

---

## Fuzz Testing (TUI)

TUI components can be fuzz-tested using `vimonkey`'s ergonomic API. This generates random keyboard input sequences, checks invariants after each action, and auto-shrinks failures to minimal reproductions.

**Location**: `*.slow.test.ts` files (fuzz tests use the `.slow.` suffix convention)

**Pattern**:

```typescript
import { test, gen, take } from 'vimonkey'

test.fuzz('cursor invariants', async () => {
  const handle = await run(<Board />, { cols: 80, rows: 24 })

  for await (const key of take(gen(['j', 'k', 'h', 'l', 'Enter']), 100)) {
    await handle.press(key)
    expect(handle.locator('[data-cursor]').count()).toBe(1)
  }
  // On failure: auto-shrinks, saves to __fuzz_cases__/
})
```

**Generators**: Uniform random, weighted, or custom pickers with preconditions:

```typescript
// Weighted: more navigation, less Enter
gen([[40, 'j'], [40, 'k'], [10, 'Enter'], [10, 'Escape']])

// Stateful: adapt to current state
gen((ctx) => {
  const state = getState()
  return state.cursor === 0 ? ctx.random.pick(['j', 'l']) : ctx.random.pick(['j', 'k', 'h', 'l'])
})
```

**Fuzz terms** (for Silvery Provider-based TUI testing):

```typescript
import { createFuzzTerm, createReplayTerm } from '../helpers/fuzz-term'

// Random key provider for app.run()
const term = createFuzzTerm({ keys: ['j', 'k', 'Enter'], count: 100, seed: 42 })

// Replay for shrinking
const term = createReplayTerm(['j', 'j', 'k', 'Enter'])
```

See `apps/km-tui/tests/helpers/fuzz-term.ts` and `vendor/vimonkey/CLAUDE.md` for full API reference.

---

## Chaos Testing (Sync)

The sync system (file watching, reconciliation, write queue) is tested using controlled chaos injection via `@beorn/watcher-chaos`.

**Key scenarios:**

| Scenario            | What It Simulates                       |
| ------------------- | --------------------------------------- |
| `SLOW_DISK`         | Events delayed 2-5 seconds              |
| `QUEUE_OVERFLOW`    | 20% of events dropped randomly          |
| `EDITOR_ATOMIC`     | Write becomes delete + add pair         |
| `EVENT_STORM`       | Bursts of 100+ events                   |
| `FSEVENTS_COALESCE` | Parent dir event instead of file events |

```typescript
import { ChaosWatcher, queueOverflow } from "@beorn/watcher-chaos"

const watcher = new ChaosWatcher({
  scenario: queueOverflow(0.2), // 20% drop rate
  seed: 12345, // Reproducible randomness
})
```

**Location**: `packages/km-storage/tests/sync/chaos/`

See [chaos-testing.md](chaos-testing.md) for full scenario reference.

---

## Layer Testing Rules

Guidelines for what each layer should and shouldn't test:

| Layer                   | Should Test                 | Should NOT Test          |
| ----------------------- | --------------------------- | ------------------------ |
| Parser (`@km/markdown`) | Parse/serialize, round-trip | Storage, UI              |
| Storage (`@km/storage`) | CRUD, queries, sync, events | UI rendering             |
| Tree (`@km/tree`)       | Tree queries, display names | Storage mutations        |
| Board (`@km/board`)     | Reducer state, selectors    | DB operations, rendering |
| TUI (`apps/km-tui`)     | Component rendering, layout | Direct storage mutations |
| CLI (`apps/km-cli`)     | Commands, workflows, errors | Internal state           |

**Test distribution target**: Storage ~40%, TUI ~20%, Board ~15%, CLI ~15%, Parser ~5%, Tree ~5%

See [archive/test-review.md](../archive/test-review.md) for detailed layer rules.

---

## See Also

- [debugging.md](debugging.md) - Debug logging and troubleshooting
- [../architecture.md](../architecture.md) - System layers
