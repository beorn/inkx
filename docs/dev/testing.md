# Testing Guide

A test system that is:

1. **Clear** - obvious what each test category does and when to use it
2. **Fast** - default to lightweight infrastructure, with option for real
3. **Documentation-like** - acceptance tests are concise enough to serve as specs
4. **Non-overlapping** - each test has a clear owner, no redundancy

> Tests exist to prevent user-visible regressions and architectural decay, not to maximize coverage.
> We prefer fewer, clearer tests with strong ownership over exhaustive suites.

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
│  - Vault: CRUD, queries  │  - Parser: parse/serialize       │
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
  );

  // BEFORE: 1a is child of col1
  board.expect("#col1 > #1a").toExist();
  board.expect("#1a + #1b").toExist(); // 1a before 1b

  // Move 1a to col2
  board.press("m").press("l").press("\r");

  // AFTER: 1a is now child of col2
  board.expect("#col2 > #1a").toExist();
  board.expect("#col1 > #1a").not.toExist();
});
```

**Example - Visual layout test (position/spacing):**

```typescript
test("columns are horizontal", () => {
  const { board } = testEnv(() =>
    item("board", item("col1", item("1a")), item("col2", item("2a"))),
  );

  const col1Box = board.q("#col1").boundingBox();
  const col2Box = board.q("#col2").boundingBox();

  // col2 is to the right of col1
  expect(col2Box.x).toBeGreaterThan(col1Box.x);
  // Both columns aligned top
  expect(col2Box.y).toBe(col1Box.y);
});
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

**Framework**: mdtest (`.test.md` files)

**Location**: `apps/km-cli/tests/sh/`

**Pattern**: Markdown files with embedded shell commands and expected output.

```markdown
# Navigation Test

$ echo -e "move_down\nstate" | km sh -r $PWD/vault @inbox.md

> MOVE_DOWN
> position: col=0 card=1
```

**When to use**: Testing CLI command output, error messages, workflows.

**Related**: `km sh` enables scripted TUI testing without rendering.

**Doctrine:** mdtest asserts semantic output, not formatting or layout. Don't assert spacing, ANSI colors, or cursor position in mdtest.

---

## 2. Core Tests

Per-layer, per-domain-object tests. Fast, isolated, use mocks by default.

### 2.1 Test Isolation with `withTestEnv`

Tests requiring database access use `withTestEnv` for isolated environments:

```typescript
import { withTestEnv } from "@km/storage";

test("creates node", async () => {
  await withTestEnv(async ({ db, vaultDir, kmDir }) => {
    // Each test gets:
    // - Unique /tmp/kmtest-{ulid}/ directory
    // - Fresh in-memory SQLite database
    // - Isolated AsyncLocalStorage contexts
    createTask(db, "Test task");
    expect(getNode(taskId)).toBeDefined();
  });
  // Cleanup automatic: db closed, temp dirs removed
});
```

**What `withTestEnv` provides**:

| Property   | Description                                    |
| ---------- | ---------------------------------------------- |
| `vault`    | Vault-like object wrapping DB-bound singletons |
| `db`       | In-memory SQLite with schema initialized       |
| `vaultDir` | Isolated `/tmp/kmtest-{id}/vault/`             |
| `kmDir`    | Isolated `/tmp/kmtest-{id}/vault/.km/`         |
| `testId`   | Unique ULID for this test                      |

The `vault` object provides these methods (typed as `TestVault`):

- `getNode`, `getChildren`, `getChildCountsBatch`
- `getBacklinks`, `getAncestors`, `getLinksTo`
- `moveNode`, `updateNode`, `deleteNode`, `addNode`
- `rawQuery` for direct SQL access

**Standard usage** (most tests):

```typescript
test("builds board from nodes", async () => {
  await withTestEnv(async ({ vault, vaultDir }) => {
    // Create test data
    const rootId = createTestNode("board", "Test Board");

    // Pass vault to functions that need DB access
    const state = buildBoardState(vault as Vault, rootId);
    expect(state.columns).toHaveLength(2);
  });
});
```

**Custom fixture** (when you need different behavior):

For Ink component tests that don't need real DB operations, use `createFakeVault()`:

```typescript
test("renders board component", async () => {
  // createFakeVault() returns an isolated in-memory vault
  const fakeVault = createFakeVault();

  const { lastFrame } = render(
    <InkBoard vault={fakeVault} initialState={state} />
  );

  expect(lastFrame()).toContain("Task 1");
});
```

**When to use which**:

| Scenario                                           | Fixture                     |
| -------------------------------------------------- | --------------------------- |
| Tests calling `buildBoardState`, `handleKey`, etc. | `withTestEnv` → `env.vault` |
| Ink component rendering (no DB mutations)          | `createFakeVault()`         |
| Pure function tests (no DB)                        | None needed                 |

**When NOT to use withTestEnv**:

- Pure function tests (no DB needed)
- Tests using `createFakeVault()` (already isolated)

### 2.2 Domain Object Tests

Each domain object gets its own test file testing the **public API**:

| Domain Object | Test File        | What to Test                     |
| ------------- | ---------------- | -------------------------------- |
| `Vault`       | `vault.test.ts`  | CRUD, queries, lifecycle         |
| `Board`       | `board.test.ts`  | State machine, reducers, actions |
| `Config`      | `config.test.ts` | Loading, validation, defaults    |

**Pattern**: Factory functions, `using` for cleanup, DI for mocks.

```typescript
test("creates node", () => {
  using vault = runGenerator(createVault(testDir));
  vault.addNode(parentId, { type: "task", content: "New task" });
  expect(vault.getNode(id)).toBeDefined();
});
```

### 2.3 Pure Function Tests

Per-layer tests for pure logic (no database, no I/O):

| Layer           | Test Focus                             |
| --------------- | -------------------------------------- |
| `@km/markdown`  | Parse constructs, round-trip, edges    |
| `@km/tree`      | Tree queries, display names, paths     |
| Board selectors | Derived state, filtering, calculations |

### 2.4 Vendor Tests

Vendor packages (`vendor/beorn-*`) are git submodules - part of km's test suite.

**Test location:** Tests live in each vendor package (e.g., `vendor/beorn-inkx/tests/`).

**Included automatically:** `test:fast` and `test:all` discover and run vendor tests.

**Rule:** km packages (`packages/`, `apps/`) must not contain component-level render/layout tests. Component behavior is validated via acceptance tests or vendor tests.

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
km screenshot /path/to/vault --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

**When to use**: Debugging visual issues, sharing TUI state in bug reports.

**Not for**: Automated tests (use inkx test renderer instead).

### Method 3: ttyd + Playwright (Deprecated)

Pixel-perfect terminal rendering via browser. **Not recommended** - slow, flaky, and being migrated to inkx.

```bash
# Legacy approach - prefer inkx createTestRenderer instead
TTYD_PORT=$((7700 + RANDOM % 300))
FORCE_TTY=1 ttyd -W -p $TTYD_PORT bun km view /tmp/vault &
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
| `.test.md`      | mdtest CLI tests                | test:mdtest, test:all |

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
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault

# Terminal 2: Watch log
tail -f /tmp/km.log
```

This captures visual state + internal events for correlation.

---

## See Also

- [test-review.md](test-review.md) - Pruning, overlap detection, test smells
- [chaos-testing.md](chaos-testing.md) - Detailed chaos testing reference
