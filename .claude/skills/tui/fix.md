---
description: Debug and fix TUI rendering issues using headless tests
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
---

# Fix TUI Rendering Issues

**Issue**: $ARGUMENTS

## Rules

1. **Failing test FIRST** — no code analysis, no theorizing until you have a test that fails
2. **Use withDiagnostics** — it has checkIncremental, checkReplay, checkStability
3. **Write to /tmp/** — diagnostics are exploratory, promote when stable
4. **If tests pass but bug is visible** — fix the diagnostic tooling, don't blame terminals
5. **Search history first** — `bun recall "bug keywords"` before writing tests. Prior sessions may have diagnosed the same area.
6. **Root cause after fix** — after fixing, analyze: why did this happen? Why didn't tests catch it? What structural change prevents this class of bug? Create a prevention bead if non-trivial.

## Rendering Bugs (Ghost Chars, Stale Pixels, Wrong Content)

**ALWAYS start with `withDiagnostics`** — it catches 95% of rendering bugs automatically:

```typescript
// /tmp/diag-rendering.test.ts
import { createBoardDriver } from "@km/tui/driver.ts"
import { createFakeRepo } from "@km/storage"
import { withDiagnostics } from "inkx"
import { item } from "@km/tui/tests/helpers/board-test.ts"

const nodes = item.root("board",
  item("Col1", item("Task 1"), item("Task 2")),
  item("Col2", item("Task 3"), item("Task 4")),
)
const driver = withDiagnostics(
  createBoardDriver(createFakeRepo({ nodes }), "board"),
  { checkIncremental: true, checkReplay: true, checkStability: true }
)

// Every command is automatically checked for:
// 1. Buffer correctness (incremental vs fresh render)
// 2. ANSI replay correctness (what terminal sees matches buffer)
// 3. Content stability (cursor moves don't change content)
await driver.cmd.down()
await driver.cmd.down()
await driver.cmd.up()
// Add view switches, level navigation, etc.
```

**Three diagnostic checks explained:**

| Check | What it catches | How |
|-------|----------------|-----|
| `checkIncremental` | Stale pixels, wrong clearing | Compares incremental render buffer vs fresh render buffer |
| `checkReplay` | Ghost chars, ANSI output bugs | Simulates terminal receiving ANSI diff, compares to buffer |
| `checkStability` | Content shifts on cursor move | Compares text before/after cursor commands |

**If all three pass but bug still visible**: The diagnostic tooling has a gap. Fix the tooling (add new checks), don't blame the terminal.

**NEVER:**
- Theorize about root causes without a failing test
- Assume "terminal emulator bug" — 99% of the time you're wrong
- Hand-roll ANSI tests when `withDiagnostics` exists

## When User Mentions a Vault Path

**IMMEDIATELY** load the real vault - don't start with synthetic data:

```typescript
// /tmp/diag-cursor-bug.spec.ts
import { test, expect } from 'vitest'
import { loadTestBoard, check } from '@km/tui/test'

test("reproduce bug with real vault", async () => {
  const board = await loadTestBoard("/tmp/v2")  // LOAD IMMEDIATELY

  // Capture initial state
  const before = { cursor: board.cursor, text: board.text }

  // Reproduce the issue
  board.press("k").press("k")  // Navigate to board level

  // Check what changed
  expect(board.text).toContain("expected content")
  check.rendering(board)
})
```

Run: `bun vitest run /tmp/diag-cursor-bug.spec.ts`

## Ad-hoc Diagnostics Workflow

1. **Write to /tmp first** - diagnostics are exploratory
2. **Load real vault** if user mentions a path
3. **Reproduce the bug** - if test fails, bug confirmed
4. **Fix the code** - iterate on the fix
5. **Promote to regression** - move to `apps/km-tui/tests/` when stable
6. **Clean up** - after the bug is fixed, the repro test MUST be either:
   - **Promoted**: renamed from `*-repro.test.ts` to a descriptive regression test name
   - **Deleted**: if the bug is already covered by other tests
   Never leave `*-repro*`, `*-debug*`, or `*-profile*` test files in the repo.
   Use `.scratch.ts` (not `.test.ts`) for temporary investigation files so they don't run in test suites.

## Quick Start (Synthetic Data)

For issues without a specific vault:

```typescript
import { createTestBoard, check } from '@km/tui/test'

const board = createTestBoard(["Col > Task A", "Col > Task B", "Col > Task C"])

board.press("j").press("j")
expect(board.cursor.card).toBe(2)

check.all(board)  // Verify nothing broke
```

## The API

```typescript
// Load real vault (PREFERRED when path mentioned)
const board = await loadTestBoard("/path/to/vault")

// Create with string DSL (for quick synthetic tests)
const board = createTestBoard(["Inbox > Task 1", "Projects > Alpha"])

// Actions (chainable)
board.press("j").press("k").press("l")
board.search("query")  // Opens search, types, hits Enter

// State
board.text       // Screen text
board.cursor     // { col: 0, card: 1, level: 'card' }
board.nodeId     // Selected node ID
board.columns()  // Column info with titles
board.cards()    // Card info with text

// Checks
check.rendering(board)   // No errors in screen
check.cursor(board)      // Cursor exists
check.all(board)         // Everything (synthetic repos only)
```

## Available Checks

```typescript
check.rendering(board)    // Screen not empty, no [object Object], no errors
check.cursor(board)       // Cursor exists (unless in dialog)
check.selection(board)    // Selected node exists in repo
check.parentLinks(board)  // All parent references valid (synthetic only)
check.nodeLinks(board)    // All link_to references valid (synthetic only)
check.all(board)          // All of the above (synthetic only)
```

## Debugging Tips

| Symptom | Check |
|---------|-------|
| Screen garbled | `check.rendering(board)` |
| Cursor disappears | `check.cursor(board)` |
| Wrong node selected | `expect(board.nodeId).toBe("expected-id")` |
| Column missing | `expect(board.columns().map(c => c.title)).toContain("name")` |

## Layout Bugs (Wrong Dimensions, Text Overflow, Card Sizing)

If the bug is about **wrong sizes or positions** (not wrong pixels), it may be a **Flexx layout caching bug** rather than an inkx rendering bug. Layout bugs manifest as incorrect `width`/`height` computations during re-layout of partially-dirty trees.

**Quick check**: Does the bug only appear after navigation (re-layout), not on initial render? → Likely a layout caching bug.

```bash
# Run the Flexx re-layout fuzz suite (1100+ tests, differential oracle)
bun vitest run vendor/beorn-flexx/tests/relayout-consistency.test.ts

# If all pass, the caching logic is correct for known patterns.
# Create a targeted test mirroring the real component structure.
```

**Bug taxonomy** (3 classes found so far):
1. **Measurement side effects** — `measureNode` overwriting layout on clean nodes
2. **Sentinel collisions** — NaN used as both "invalidated" and "unconstrained"
3. **Fingerprint incompleteness** — parent override not captured in cache key

See `vendor/beorn-flexx/docs/incremental-layout-bugs.md` for full details, industry context, and debugging methodology.

## See Also

- [explore/random.md](../explore/random.md) — Fuzz testing
- `docs/lessons/layout-caching.md` — Layout caching bugs lesson
- `vendor/beorn-flexx/docs/testing.md` — Flexx test infrastructure
