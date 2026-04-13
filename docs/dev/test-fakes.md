# Test Fakes Inventory

This document catalogs all behavioral fakes (test doubles) available in the km test infrastructure. Fakes provide fast, isolated testing without real database or filesystem I/O.

---

## Key Concepts

### Fakes vs TEST_MODE

**Fakes** and **TEST_MODE** serve different purposes:

| Concept       | Purpose                                        | How It Works                                              |
| ------------- | ---------------------------------------------- | --------------------------------------------------------- |
| **Fakes**     | Fast unit tests with controlled behavior       | In-memory implementations that mimic real interfaces      |
| **TEST_MODE** | Infrastructure selection for integration tests | Environment variable controlling DB type (memory vs disk) |

**Fakes are independent of TEST_MODE** - they work regardless of mode. Use fakes when you need:

- Controlled test data without DB setup
- Fast iteration without I/O overhead
- Specific scenarios (errors, edge cases)

### When to Use What

| Scenario                  | Use This                         | Not This           |
| ------------------------- | -------------------------------- | ------------------ |
| TUI rendering tests       | `createFakeRepo()` + `testEnv()` | `withTestEnv()`    |
| Board state machine tests | `createFakeRepo()`               | `withTestEnv()`    |
| Storage layer tests       | `withTestEnv()`                  | `createFakeRepo()` |
| Sync/reconciliation tests | `withTestEnv()` with real fs     | Fakes              |
| Chaos/failure injection   | `createChaosFakeRepo()`          | Regular fakes      |
| Benchmarks                | `withTestEnv()` with real infra  | Fakes              |

### Drift Detection

If a test passes with fakes but fails with real infrastructure:

1. The fake is too permissive (allows behavior real infra rejects)
2. Update the fake to be more realistic
3. Add a regression test

If a test fails with fakes but passes with real:

1. The fake is too strict
2. Update the fake to match actual behavior

Run `TEST_MODE=real bun run test:all` periodically to detect drift.

---

## Repo Fakes

### FakeRepo

**Location**: `@km/storage` → `createFakeRepo()`

In-memory Repo implementation using Map storage. Provides all Repo interface methods without SQLite.

```typescript
import { createFakeRepo } from "@km/storage"

// Empty repo
const repo = createFakeRepo()
repo.addNode(null, { type: "task", content: "New task" })

// With initial data
const repo = createFakeRepo({
  nodes: [
    { id: "1", type: "section", content: "Tasks", parent_id: null, ... },
    { id: "2", type: "task", content: "Do something", parent_id: "1", ... },
  ],
})
```

**Key features**:

- Full Repo interface (getNode, getChildren, addNode, updateNode, etc.)
- No database required
- Instant operations
- Test helpers: `getAllNodes()`, `getAllLinks()`, `reset()`

**When to use**: TUI tests, board state tests, any test that doesn't need real DB behavior.

### ChaosFakeRepo

**Location**: `@km/storage` → `createChaosFakeRepo()`

Extends FakeRepo with chaos testing capabilities for injecting inconsistencies and simulating failures.

```typescript
import { createChaosFakeRepo } from "@km/storage"

const repo = createChaosFakeRepo({ nodes: [...] })

// Inject orphaned node (parent doesn't exist)
repo.injectOrphan({ id: "orphan", parent_id: "missing-parent", ... })

// Inject circular reference
repo.injectCircularRef("child-id", "ancestor-id")

// Simulate corruption
repo.simulateCorruption("node-id", "missing_parent")

// Validate consistency
const issues = repo.validateConsistency()
expect(issues).toHaveLength(2)
```

**Corruption types**:

- `missing_parent` - Node references non-existent parent
- `circular_parent` - Node is its own ancestor
- `duplicate_id` - Multiple nodes with same ID
- `orphaned` - Node with parent that doesn't list it as child
- `invalid_position` - parent_idx out of bounds or duplicate
- `missing_content` - Node with undefined required fields
- `stale_hash` - content_hash doesn't match content

**When to use**: Testing reconciliation logic, sync error handling, data validation.

### ChaosHooks

**Location**: `@km/storage` → `createChaosHooks()`

Repo lifecycle hooks that inject failures at configurable rates. Use with real repos.

```typescript
import { createChaosHooks, createSeededRandom } from "@km/storage"

// 10% mutation drop rate
const hooks = createChaosHooks({ mutationDropRate: 0.1 })

// Deterministic testing with seeded random
const hooks = createChaosHooks({
  mutationDropRate: 0.5,
  random: createSeededRandom(12345),
})

// Track chaos events
const events: ChaosEvent[] = []
const hooks = createChaosHooks({
  mutationDropRate: 0.1,
  onChaosEvent: (e) => events.push(e),
})

// Use with repo
using repo = runGenerator(createRepo(path, { hooks }))
```

**When to use**: Application-level chaos testing, testing retry logic, resilience testing.

---

## Watcher Fakes

### FakeWatcher

**Location**: `@km/storage` → `createFakeWatcher()`

Mock file watcher that implements the Watcher interface without filesystem watching.

```typescript
import { createFakeWatcher } from "@km/storage"

const watcher = createFakeWatcher()

// Inject into repo via factory
using repo = runGenerator(
  createRepo(repoDir, {
    watcherFactory: () => watcher,
  }),
)

// Start watching
await repo.watch().start()

// Simulate file changes
watcher.emitChange([{ type: "change", path: "/test.md" }])
watcher.emitReady()
watcher.emitError(new Error("Simulated error"))
```

**When to use**: Testing sync reactions to file changes without real fs events.

---

## Filesystem Fakes

### FakeFileSystem

**Location**: `@beorn/watcher-chaos` (re-exported from `@km/storage`)

In-memory filesystem with error injection for chaos testing.

```typescript
import { createFakeFileSystem } from "@beorn/watcher-chaos"

const fs = createFakeFileSystem({
  files: {
    "/repo/board.md": "# Board\n- [ ] Task 1",
    "/repo/notes.md": "# Notes",
  },
})

// Inject errors
fs.injectError("/repo/board.md", "read", new Error("ENOENT"))

// Use with sync operations
const content = fs.readFile("/repo/board.md") // throws injected error
```

**Error injection types**:

- Read errors (ENOENT, EACCES, etc.)
- Write errors (ENOSPC, EROFS, etc.)
- Stat errors

**When to use**: Testing file operation error handling, sync robustness.

---

## Fixture Builders

### DSL Fixtures (board, column, task)

**Location**: `@km/storage` → `fixtures.ts`

Declarative DSL for creating board fixtures.

```typescript
import { board, column, task, section, paragraph } from "@km/storage"

const fixture = board("My Board", [
  column("To Do", [task("Task 1"), task("Task 2", { done: true })]),
  column("In Progress", [task("Task 3")]),
  column("Done", []),
])

// Use with FakeRepo
const repo = createFakeRepo({ nodes: fixture.nodes })
```

**Builders**:

- `board(title, columns)` - Root board with columns
- `column(title, children)` - Column (section type)
- `task(content, { done? })` - Task node
- `section(title, children)` - Nested section
- `paragraph(content)` - Body content

**Pre-built fixtures**:

- `SIMPLE_BOARD` - 3 columns with basic tasks
- `NESTED_BOARD` - Board with nested sections
- `BODY_CONTENT_BOARD` - Board with paragraph content

### Tree Builder (item)

**Location**: `apps/km-tui/tests/helpers/board-test.ts`

Compact tree-style fixture builder using nested function calls. Content is used as the ID for easy test referencing.

```typescript
import { item, testEnv } from "../helpers/board-test"

// Create nodes inline - content becomes ID
const nodes = item(
  "board",
  item("col1", item("1a"), item("1b")),
  item("col2", item("2a")),
)

// With rules (WIP limits, etc.)
const nodes = item("board", item("col1 km.limit:: 3", item("1a"), item("1b")))
```

**When to use**: TUI tests where you want minimal boilerplate and self-documenting IDs.

---

## TUI Test Helpers

### testEnv()

**Location**: `apps/km-tui/tests/helpers/board-test.ts`

One-line fixture creation + rendering with fluent API. Combines tree builder with Silvery test renderer.

```typescript
import { testEnv, item } from "../helpers/board-test"

// Create and render in one call
const { board } = testEnv(() =>
  item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))),
)

// Fluent assertions
board.press("j").expect("#1b[data-cursor]").toExist()
board.expect("#col1 > #1a").toExist()

// Position checks
const col1Box = board.q("#col1").boundingBox()
const col2Box = board.q("#col2").boundingBox()
expect(col2Box.x).toBeGreaterThan(col1Box.x)

// Status checks
expect(board.bell).toBe(false)
expect(board.hasStatus).toBe(false)
```

**API**:

- `board.press(key)` - Send keypress (chainable)
- `board.expect(selector)` - CSS selector assertions
- `board.q(selector)` - Get InkxLocator for advanced queries
- `board.screenshot()` - Get current frame as text
- `board.bell` - Check if boundary hit
- `board.hasStatus` / `board.getStatus()` - Status bar state

### renderBoard()

**Location**: `apps/km-tui/tests/helpers/board-test.ts`

Lower-level board rendering for tests that need more control.

```typescript
import { renderBoard, SIMPLE_BOARD } from "../helpers/board-test"

const b = renderBoard(SIMPLE_BOARD, { columns: 80, rows: 24 })

b.expectVisible("Task 1")
b.press("j")
b.expectSelected("Task 2")
```

---

## withTestEnv vs Fakes

### withTestEnv

**Location**: `@km/storage` → `withTestEnv()`

Creates isolated test environment with real SQLite (in-memory by default) and temp filesystem.

```typescript
import { withTestEnv } from "@km/storage"

test("creates node", async () => {
  await withTestEnv(async ({ db, repo, repoDir, emitter }) => {
    // Real SQLite DB (in-memory)
    // Real temp filesystem (/tmp/kmtest-*)
    // Full Repo interface
    repo.addNode(null, { type: "task", content: "Test" })
    expect(repo.getAllNodes()).toHaveLength(1)
  })
  // Automatic cleanup
})
```

**When to use**:

- Testing actual DB queries
- Testing storage layer behavior
- Integration tests
- Benchmarks (with `TEST_MODE=real`)

### createFakeRepo

No database, no filesystem - pure in-memory Map storage.

**When to use**:

- TUI/rendering tests
- State machine tests
- Tests that don't care about persistence
- Maximum speed

---

## See Also

- [testing.md](testing.md) - Main testing guide
- [test-system.md](test-system.md) - Test system architecture
- [chaos-testing.md](chaos-testing.md) - Chaos testing scenarios
