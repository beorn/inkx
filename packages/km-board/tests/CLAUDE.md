# km-board Tests

**Layer 4 — Action Sequences**: Actions in, state transitions out. Trust km-storage for node existence.

## What to Test Here

- Reducer state transitions: dispatch action → verify new state shape
- Action composition: fold + zoom + cursor interactions
- Grid navigation: column/row traversal, boundary behavior
- State invariants: cursor always points to valid node, selection is consistent

## What NOT to Test Here

- How state renders on screen — that's km-tui
- File ↔ DB sync — that's km-storage
- Markdown parsing — that's km-markdown

## Patterns

Pure state machine tests. No helpers needed — create state inline, dispatch actions, assert.

```typescript
import { createBoardState, boardReducer } from "@km/board"

test("fold action updates fold set and moves cursor", () => {
  const state = createBoardState({ nodes, rootId: "board" })
  const next = boardReducer(state, { type: "FOLD_NODE", nodeId: "col1" })

  expect(next.foldedNodes.has("col1")).toBe(true)
  expect(next.cursorId).not.toBe("col1") // cursor moved away
})
```

## This Package Needs More Tests

This package has only 2 test files. Most board behaviors are currently tested through km-tui's `testEnv()` (~1.8s per file). Pure reducer tests here cost ~50ms — **36x cheaper**.

**Why fatten km-board tests** (validated by deep research, aligns with Bubble Tea/Elm best practices):

- **Faster feedback**: Reducer tests run in ~50ms vs ~1.8s for testEnv()
- **Precise failure localization**: A failing reducer test tells you WHERE; a failing journey test only tells you THAT
- **Edge case coverage**: Some state machine edge cases are hard to reach through UI interaction
- **Complements journey tests**: Unit tests don't replace journey tests — they complement them

**Priority areas for new tests:**

1. Fold/unfold edge cases: fold last card, fold empty column, fold nested, fold+zoom interaction
2. Cursor movement rules: boundary behavior, wrapping, cursor-follows-fold/unfold
3. Multi-action sequences: move+undo+redo, edit+move+undo restores both
4. Selection invariants: cursor always points to valid node, selection is consistent after mutations
5. Empty/degenerate states: empty board, single column, single card

See `km-all.board-test-migration` (blocked on TEA machines refactor).

## Ad-Hoc Testing

```bash
bun vitest run packages/km-board/tests/            # All board tests (~instant)
bun vitest run packages/km-board/tests/ -t "fold"   # By test name
```

For quick state machine verification:

```typescript
import { createBoardState, boardReducer } from "@km/board"

test("quick check: action sequence", () => {
  const state = createBoardState({ nodes, rootId: "board" })
  const s1 = boardReducer(state, { type: "ACTION", ... })
  const s2 = boardReducer(s1, { type: "ACTION2", ... })
  // Inspect state
})
```

## Efficiency

Pure state machine tests — no database, no rendering. Should be fast (~500ms import cost from Zustand). If a test needs screen assertions, it belongs in km-tui. If it needs file I/O, it belongs in km-storage.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
