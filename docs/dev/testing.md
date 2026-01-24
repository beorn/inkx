# Testing Guide

Comprehensive guide for testing strategy, patterns, and best practices.

---

## Quick Reference

| Tool       | Purpose                      | Command                                    |
| ---------- | ---------------------------- | ------------------------------------------ |
| `bun test` | Unit & integration tests     | `bun test`, `bun test packages/km-storage` |
| `mdtest`   | Golden file CLI tests        | `bun run test:mdtest`                      |
| `km sh`    | TUI state testing (headless) | `km sh @root -c 'move_down; state'`        |
| Playwright | Visual TUI screenshots       | `cd tests/tui && playwright test`          |

**Quality gates (MUST pass before commit):**

```bash
bun fix        # Lint + format
bun run test:fast   # Fast iteration (~4s)
bun run test:all    # All tests including mdtest (before commit)
```

**Related**: See [test-review.md](test-review.md) for pruning, overlap detection, and test smell checklists.

---

## Testing Pyramid

```
                    ┌─────────────────────┐
                    │   Visual/E2E (5%)   │  ← Playwright, manual
                    │  Full system tests  │
                    ├─────────────────────┤
                    │  Integration (30%)  │  ← Real fs/db, CLI
                    │  Multi-layer flows  │
                    ├─────────────────────┤
                    │    Unit (65%)       │  ← Pure functions
                    │  Single layer/fn    │
                    └─────────────────────┘
```

---

## Layers and Testing Strategy

### Parser Layer (`@km/markdown`)

**Testing Approach**: Heavy unit testing + round-trip validation

| Test Type  | Purpose                                    |
| ---------- | ------------------------------------------ |
| Unit       | Parse individual constructs                |
| Round-trip | Preserve structure through parse→serialize |
| Edge cases | Handle malformed input gracefully          |

**DO test**: Each markdown construct, edge cases, round-trip preservation
**DON'T test**: Integration with store, how parsed nodes display in TUI

---

### Storage Layer (`@km/storage`)

**Testing Approach**: Unit tests for pure functions, integration tests for store lifecycle

| Test Type    | Purpose                               |
| ------------ | ------------------------------------- |
| Unit         | Query parsing, path utilities         |
| Integration  | Full store lifecycle with real SQLite |
| Event replay | Rebuild from event log                |

**DO test**: Query language, CRUD operations, event sourcing, node resolution
**DON'T test**: Filesystem watching, how nodes render

---

### Board Layer (`@km/board`)

**Testing Approach**: Unit tests for pure reducer functions

| Test Type   | Purpose                   |
| ----------- | ------------------------- |
| Unit        | Reducer state transitions |
| Unit        | Selectors/transformers    |
| Integration | Shell execution sequences |

**DO test**: Every action type, edge cases, state serialization
**DON'T test**: React rendering, store integration

---

### UI Components (`@km/tui`)

**Testing Approach**: Component tests (props → element), minimal

| Test Type | Purpose                             |
| --------- | ----------------------------------- |
| Component | Verify props produce valid elements |
| Smoke     | Components don't crash              |

**DO test**: Component renders with various props, edge cases
**DON'T test**: Visual appearance (use visual tests instead)

#### TUI Test File Organization

TUI tests are split by speed and dependencies:

| File Pattern           | Database          | Speed         | Run In      |
| ---------------------- | ----------------- | ------------- | ----------- |
| `board-state.test.ts`  | No (pure data)    | Fast (~100ms) | `test:fast` |
| `board-render.test.ts` | No (pure data)    | Fast (~90ms)  | `test:fast` |
| `board-keys.test.ts`   | No (fixtures)     | Fast (~90ms)  | `test:fast` |
| `board.slow.test.ts`   | Yes (real SQLite) | Slow (~1s)    | `test:all`  |

**Fixtures**: Use `tests/fixtures/board-fixtures.ts` for pure data factories:

```typescript
import {
  createSimpleTestBoard,
  createCardState,
} from "./fixtures/board-fixtures.ts";

test("navigation moves down", () => {
  const { state } = createSimpleTestBoard(); // No database!
  const result = handleKey(state, "j");
  expect(result.state.cardIndex).toBe(1);
});
```

**When to use fixtures vs real database:**

- **Fixtures**: Testing state logic, key handling, pure rendering
- **Real DB**: Testing buildBoardState, initBoardState, integration with storage

---

### CLI/Application (`apps/km-cli`)

**Testing Approach**: Integration and E2E tests

| Test Type   | Purpose                      |
| ----------- | ---------------------------- |
| Integration | CLI commands with real vault |
| E2E         | Full workflows               |
| Golden      | Expected output matches      |

---

## km-sh + mdtest Integration

The **recommended approach** for TUI behavior testing:

- **Fast**: No rendering, no browser, just state transitions
- **Deterministic**: Same input always produces same output
- **Documented**: Tests ARE the behavior spec
- **CI-friendly**: Runs in any environment

### Example

````markdown
# TUI Navigation Tests

```bash file=vault/inbox.md
# Inbox
- [ ] Task 1
- [ ] Task 2
```

```console
$ echo -e "move_down\nstate" | km sh -r $PWD/vault @inbox.md
> MOVE_DOWN
position: col=0 card=1
[...]
```
````

---

## Test Commands

```bash
# Fast iteration
bun run test:fast              # ~4 seconds

# Full suite
bun test                       # All unit tests (~45s)
bun run test:all               # Unit + mdtest (~2min)
bun run test:mdtest            # Only mdtest

# Specific package
bun test packages/km-storage

# Filtered tests
bun test query                 # Files matching "query"
```

---

## Test Decision Tree

```
Is it a pure function?
├── Yes → Unit test
└── No
    ├── Does it touch filesystem/database?
    │   ├── Yes → Integration test
    │   └── No → Unit test (mock dependencies)
    └── Is it user-facing CLI output?
        ├── Yes → Golden file test (mdtest)
        └── No
            └── Is it visual TUI appearance?
                ├── Yes → Playwright (sparingly)
                └── No → Integration test
```

---

## Coverage Goals

| Layer      | Target | Notes                              |
| ---------- | ------ | ---------------------------------- |
| Parser     | 90%    | Round-trip tests cover most paths  |
| Storage    | 85%    | Good CRUD coverage, expand queries |
| Board      | 95%    | All actions covered                |
| Components | 70%    | Expand prop combinations           |
| CLI        | 80%    | Add error path coverage            |

---

## Debugging TUI Issues

**Preferred method: DEBUG_LOG + Visual Inspection**

For investigating TUI bugs, combine debug logging with visual inspection:

```bash
# Terminal 1: Run TUI with debug logging to file
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault

# Terminal 2: Watch the debug log
tail -f /tmp/km.log
```

This approach captures:

| What you see | What you learn                     |
| ------------ | ---------------------------------- |
| TUI renders  | Visual state at each moment        |
| Debug log    | State transitions, events, timing  |
| Correlation  | Match visual changes to log events |

**Example debugging session (watcher bug):**

```bash
# User reports: "issues disappear after watcher syncs"

# 1. Run with debug logging
DEBUG=km:storage:watch:* DEBUG_LOG=/tmp/km.log bun km view @issue.md

# 2. Watch log for clues
tail -f /tmp/km.log

# 3. Trigger the bug (edit a file externally)

# 4. Log reveals:
#    worker: fs event: change /Users/.../km/.git/FETCH_HEAD
#    → .git files being processed despite ignore patterns!
```

**When to use DEBUG_LOG + visual inspection:**

- "Why did X happen?" bugs - see the sequence of events
- Performance issues - timing visible in logs
- State bugs - state transitions logged
- Watcher/sync issues - file events and reconciliation visible

**Alternative: tmux debug mode**

```bash
bun debug view /path/to/vault
# Opens tmux: TUI on left, debug log on right
```

---

## See Also

- [../02-architecture.md](../02-architecture.md) — Layer responsibilities
- [../08-cli.md](../08-cli.md) — CLI commands
