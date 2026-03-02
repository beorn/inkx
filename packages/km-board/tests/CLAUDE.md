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

## Note on Test Count

This package has only 2 test files. Many board behaviors are currently tested through km-tui's `testEnv()` which exercises the full stack. Consider adding more pure reducer tests here when:
- Testing complex action sequences (fold + zoom + cursor composition)
- Testing state invariants that don't depend on rendering
- The behavior is about state transitions, not visual output

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

- [Test layering philosophy](../../../.claude/skills/tests/test-layers.md)
