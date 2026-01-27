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
const syncManager = new SyncManager({ useWorker: true })
```

### Correct Patterns

```typescript
// ✅ DI via withTestEnv - in-memory DB, isolated /tmp
await withTestEnv(async ({ db, repo, repoDir }) => {
  // Test code here
})

// ✅ FakeRepo for state-only tests - no DB at all
const repo = createFakeRepo({ nodes: fixtures })

// ✅ Mock watcher for sync tests
const syncManager = new SyncManager({ db, useWorker: false })
```

---

## File Naming Conventions

**Reserved for acceptance tests:**

- `.spec.ts` - TUI UI-level acceptance tests (board.spec.ts)
- `.spec.md` - CLI acceptance tests (reserved, not yet used)

**For unit/integration tests:**

- `.test.ts` - Fast unit/integration tests (<1s each)
- `.slow.test.ts` - Slow tests (chaos fuzzer, heavy integration)
- `.test.md` - mdtest CLI tests (current convention, may migrate to `.spec.md`)

| Suffix          | Purpose                   | Test Level | Included in           |
| --------------- | ------------------------- | ---------- | --------------------- |
| `.spec.ts`      | TUI acceptance (UI-level) | E2E        | test:fast, test:all   |
| `.test.ts`      | Unit/integration tests    | Unit/Int   | test:fast, test:all   |
| `.slow.test.ts` | Slow integration, chaos   | Int/E2E    | test:all only         |
| `.test.md`      | mdtest CLI tests          | E2E        | test:mdtest, test:all |

**Rule**: Use `.spec.ts` ONLY for acceptance tests (board UI-level, CLI workflows). All other tests use `.test.ts`.

---

## Test Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              1. ACCEPTANCE TESTS                            │
│         (end-user visible, documentation-like)              │
├──────────────────────────┬──────────────────────────────────┤
│  VISUAL (TUI)            │  CLI                             │
│  inkx createTestRenderer │  mdtest (.test.md)               │
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
│  VENDOR (git submodules) │  (tests in vendor/beorn-*/,      │
│  - inkx, flexx, logger   │   included in test:fast)         │
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

**Framework**: `inkx/testing` with `testEnv()` helper from `board-test.ts`

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

- `board.press(key)` - keyboard input (chainable)
- `board.expect(selector)` - fluent assertions
- `board.q(selector)` - advanced queries (returns InkxLocator)
- `.toExist()` / `.toHaveCount(n)` - custom matchers
- `.boundingBox()` - visual position checks

**CSS selectors**:

- `#col1 > #1a` - 1a is direct child of col1
- `#1a + #1b` - 1b immediately follows 1a
- `#1a[data-cursor]` - cursor is on 1a
- `[data-selected]` - all selected items
- `[data-view="card"]` - all cards

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

### 1.2 CLI Tests (mdtest)

**Framework**: mdtest (`.test.md` files) with km-repl plugin

**Location**: `apps/km-cli/tests/sh/`

**Pattern**: In-process execution with memory database for fast tests.

#### Configuration (REQUIRED)

```yaml
---
mdtest:
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

**Doctrine:** mdtest asserts semantic output, not formatting or layout. Don't assert spacing, ANSI colors, or cursor position in mdtest.

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

Vendor packages (`vendor/beorn-*`) are git submodules - part of km's test suite.

**Test location:** Tests live in each vendor package (e.g., `vendor/beorn-inkx/tests/`).

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

## Infrastructure Modes

All tests default to lightweight infrastructure. Use `TEST_MODE` to switch:

| Mode         | Database | Filesystem | Speed   | Use Case                      |
| ------------ | -------- | ---------- | ------- | ----------------------------- |
| **standard** | Memory   | Real /tmp  | ~24s    | Default, everyday testing     |
| **mock**     | Memory   | Real /tmp  | ~20s    | Skip watcher/sync tests       |
| **real**     | Disk     | Real /tmp  | ~3-5min | CI, releases, drift detection |

All modes create filesystem for compatibility. Speed differences:

- **mock** vs **standard**: Skip slow watcher/sync tests with `test.skipIf(isMockMode())`
- **standard** vs **real**: Memory DB is faster than disk DB operations

**Commands**:

```bash
bun run test:fast    # Standard mode (default)
bun run test:mock    # Mock mode - skips watcher tests
bun run test:real    # Real mode - disk DB + all tests
```

**Environment variable**: `TEST_MODE=mock|standard|real`

**In test code**:

```typescript
import { getTestMode, isMockMode, isRealMode } from "@km/storage";

// Skip slow infrastructure tests in mock mode
test.skipIf(isMockMode())("file watcher syncs", () => { ... });

// Only run in real mode (detect mock drift)
test.skipIf(!isRealMode())("disk db behavior", () => { ... });
```

**Mock drift detection**: Periodic `test:real` runs catch when mocks diverge from reality.

---

## Visual Testing Methods

### Method 1: inkx Test Renderer (Primary)

Fast, character-based testing for components:

```typescript
import { createTestRenderer, createLocator } from "inkx/testing";

const render = createTestRenderer({ columns: 80, rows: 24 });
const { lastFrameText, getContainer, stdin } = render(<Board {...props} />);

// Text assertions
expect(lastFrameText()).toContain("Task 1");

// DOM-like queries with position
const locator = createLocator(getContainer());
const task = locator.getByTestId("task-1");
expect(task.boundingBox()?.x).toBe(10);

// Keyboard input
stdin.write("j"); // Move down
```

### Method 2: `km screenshot` (Debugging Only)

Quick capture of current TUI state for **manual inspection**. Not for automated testing - you can't send keystrokes programmatically.

```bash
km screenshot /path/to/repo --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

**When to use**: Debugging visual issues, sharing TUI state in bug reports.

**Not for**: Automated tests (use inkx test renderer instead).

### Method 3: ttyd + Playwright (Deprecated)

Pixel-perfect terminal rendering via browser. **Not recommended** - slow, flaky, and being migrated to inkx.

```bash
# Legacy approach - prefer inkx createTestRenderer instead
TTYD_PORT=$((7700 + RANDOM % 300))
FORCE_TTY=1 ttyd -W -p $TTYD_PORT bun km view /tmp/repo &
sleep 3
HEADLESS=true bun x playwright screenshot \
  --viewport-size=1000,700 \
  http://localhost:$TTYD_PORT /tmp/screenshot.png
pkill -f ttyd
```

---

## Quick Reference

### File Naming

| Suffix          | Purpose                         | Included in           |
| --------------- | ------------------------------- | --------------------- |
| `.test.ts`      | Fast tests (<1s each)           | test:fast, test:all   |
| `.slow.test.ts` | Slow tests (integration, chaos) | test:all only         |
| `.spec.ts`      | TUI acceptance tests            | test:fast, test:all   |
| `.test.md`      | mdtest CLI tests                | test:mdtest, test:all |

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

### Commands

```bash
bun run test:fast       # Fast iteration (~24s)
bun run test:all        # Full suite including mdtest
bun run test:mdtest     # Only mdtest
TEST_MODE=real bun test # Real infrastructure
```

### When to Use What

| Testing Need             | Use This                | Not This         |
| ------------------------ | ----------------------- | ---------------- |
| TUI rendering/navigation | inkx createTestRenderer | Playwright       |
| CLI command output       | mdtest (.test.md)       | Unit test        |
| Domain object behavior   | Unit test with DI       | Integration test |
| Pure function logic      | Unit test               | mdtest           |
| Sync edge cases          | Chaos tests             | More unit tests  |
| Visual debugging         | `km screenshot`         | Peekaboo         |

### Decision Tree

```
Is it end-user visible behavior?
├── Yes, TUI → Visual acceptance test (inkx)
├── Yes, CLI → mdtest (.test.md)
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

**Preferred method**: DEBUG_LOG + Visual Inspection

```bash
# Terminal 1: Run with debug logging
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/repo

# Terminal 2: Watch log
tail -f /tmp/km.log
```

This captures visual state + internal events for correlation.

---

## Performance Verification

### Speed Targets

| Suite     | Target | Rationale                |
| --------- | ------ | ------------------------ |
| test:fast | <5s    | Developer iteration loop |
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

# Find mdtests without memory: true
grep -L "memory: true" apps/km-cli/tests/sh/*.test.md
```

### File Naming Rules

Tests taking >1s MUST be marked `.slow.test.ts`:

| Time | Action                                        |
| ---- | --------------------------------------------- |
| <1s  | Keep as `.test.ts`                            |
| 1-5s | Consider optimization or mark `.slow.test.ts` |
| >5s  | MUST be `.slow.test.ts`                       |

---

## See Also

- [test-review.md](test-review.md) - Pruning, overlap detection, test smells
- [chaos-testing.md](chaos-testing.md) - Detailed chaos testing reference
