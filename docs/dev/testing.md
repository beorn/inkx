# Testing Guide

A test system that is:

1. **Clear** - obvious what each test category does and when to use it
2. **Fast** - default to lightweight infrastructure, with option for real
3. **Documentation-like** - acceptance tests are concise enough to serve as specs
4. **Non-overlapping** - each test has a clear owner, no redundancy

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
│              2. MODULE TESTS                                │
│         (per layer, per domain object)                      │
├─────────────────────────────────────────────────────────────┤
│  DOMAIN OBJECTS          │  PURE FUNCTIONS                  │
│  - Vault: CRUD, queries  │  - Parser: parse/serialize       │
│  - Board: state machine  │  - Tree: queries, formatting     │
│  - Config: loading       │  - Formatters, validators        │
├──────────────────────────┼──────────────────────────────────┤
│  VENDOR COMPONENTS       │                                  │
│  - inkx: render, layout  │  (vendor tests owned by vendor)  │
│  - flexx: layout engine  │                                  │
│  - logger, etc.          │                                  │
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

### 1.1 Visual Tests (TUI)

**Framework**: `inkx/testing` with `createTestRenderer()` + `InkxLocator`

**Location**: `apps/km-tui/tests/`

**Key capabilities**:

- `createTestRenderer({ columns, rows })` - fast character-based rendering (~ms)
- `stdin.write()` - simulate keyboard input
- `InkxLocator.boundingBox()` - get `{x, y, width, height}` screen coordinates
- `getByText()`, `getByTestId()`, `locator('[data-attr]')` - DOM-like queries

**Example using helper toolbelt**:

```typescript
const board = renderBoard(SIMPLE_BOARD);

// Navigation - reads like documentation
board.press("l").expectCursor({ col: 1 });
board.press("j").expectCursor({ card: 1 });

// Content assertions
board.expect("Task 1").inColumn("To Do");
board.expect("cursor").rightOf("column-0");

// State
board.expectSelected("Task 2");
board.expectColumnCount(2);
```

**When to use**: Testing TUI rendering, navigation, keyboard handling.

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

---

## 2. Module Tests

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

| Property   | Description                              |
| ---------- | ---------------------------------------- |
| `db`       | In-memory SQLite with schema initialized |
| `vaultDir` | Isolated `/tmp/kmtest-{id}/vault/`       |
| `kmDir`    | Isolated `/tmp/kmtest-{id}/vault/.km/`   |
| `testId`   | Unique ULID for this test                |

**When to use**:

- Tests that call database functions (`getNode`, `getTasksByStatus`, etc.)
- Tests that need filesystem isolation
- Integration tests with multiple components

**When NOT to use**:

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

### 2.4 Vendor Component Tests

**Scope**: Vendor packages only (inkx, flexx, logger).

For km packages, acceptance tests already cover component behavior. Component tests in km packages create overlap.

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

**Rule**: NEVER delete regression tests - they document real bugs.

**When to run**: Always (part of `test:fast`).

---

## Infrastructure Modes

All tests default to lightweight infrastructure.

| Mode        | Infrastructure   | Speed   | When to Run                   |
| ----------- | ---------------- | ------- | ----------------------------- |
| **default** | Memory DB, mocks | ~10-30s | Every test run                |
| **real**    | Real fs, disk DB | ~3-5min | CI, releases, drift detection |

**Environment variable**: `TEST_MODE=real bun test`

**Mock drift detection**: Periodic `TEST_MODE=real` runs catch when mocks diverge from reality.

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
