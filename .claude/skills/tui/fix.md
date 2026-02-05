---
description: Debug and fix TUI rendering issues using headless tests
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
---

# Fix TUI Rendering Issues

**Issue**: $ARGUMENTS

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

## See Also

- [explore/random.md](../explore/random.md) — Fuzz testing
