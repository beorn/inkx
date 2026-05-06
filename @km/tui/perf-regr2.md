---
mentions:
  - km
id: "@km/tui/perf-regr2"
aliases:
  - km-tui.perf-regr2
  - km-tui-perf-regr2
created_at: 2026-02-06T23:03:50Z
closed_at: 2026-02-07T09:20:03Z
---

# [x] Performance regression after Phase 6 store refactor + NodeLine unification @km/tui #bug #P2

## Performance Regression After Phase 6 Store Refactor

The TUI is noticeably slower after the Phase 6 store refactor (commits b4d68773..e41bab6b).
This replaced RTK/immer/reselect with a plain Zustand-like store + useSyncExternalStore.

## Root Causes (ranked by impact)

### P0 — useApp() hook missing equality check (SMOKING GUN)

The `useApp()` hook in `vendor/beorn-inkx/src/runtime/create-app.tsx:214` does NOT compare
old vs new selected values before calling setState:

```tsx
useEffect(() => {
  return store.subscribe((newState) => {
    setState(() => selectorRef.current(newState))  // ALWAYS fires — no Object.is check
  })
}, [store])
```

Compare with zustand's `useStore`:

```tsx
// zustand checks: if (Object.is(currentSlice, nextSlice)) return;
```

Board.tsx now has 7 separate useAppStore() calls (lines 521-537):

- s.ui, s.boardState, s.toastQueue, s.layoutRegistry, s.setUI, s.dispatchBoard, s.updateLayout

Every store mutation fires ALL 7 subscriptions, each calling setState unconditionally.
React batches within a single event but the diffing/reconciliation cost is multiplied.

With RTK/reselect, memoized selectors would return the same reference for unchanged slices.
Now, every store change = 7 setState calls = 7 potential re-renders of Board.

### P0 — updateLayout() write-back creates render loop

Board.tsx:631-644:

```tsx
useEffect(() => {
  updateLayout(columnsLayout, selectedNode, derivedSelectionLevel, tuiBoardState)
}, [columnsLayout, selectedNode, derivedSelectionLevel, tuiBoardState, updateLayout])
```

This writes derived state BACK into the store after every render.
updateLayout calls set({layout, selectedNode, selectionLevel, tuiBoardState}),
which fires all subscribers again, potentially causing a second render cycle per keypress.

### P1 — assembleBoardState() creates new objects on every dispatch

board-app-store.ts:115-143: Every dispatchBoard call goes through withBoardState(),
which spreads `{...state, ...flatUpdate}` then calls assembleBoardState(),
creating a brand new boardState object even when only unrelated fields changed.
Board reads `s.boardState` — always gets a new ref → always re-renders.

### P1 — tuiBoardState useMemo has unstable deps

Board.tsx:609-623: `tuiBoardState` depends on `[boardState, columnsLayout]`.
Since boardState is a new object every dispatch (P1 above), this useMemo
NEVER memoizes — it recomputes every render, creating a new TUIBoardState.
This cascades through the entire component tree.

### P1 — N×useAppStore subscriptions in TreeNode

TreeNode.tsx:170-172: Every TreeNode instance subscribes to the store:

```tsx
const isFolded = useAppStore<BoardAppStore, boolean>(s => s.foldedNodes.has(node.id))
```

For a board with 200 cards, that's 200+ store subscriptions, each running their
selector on every store change. Without equality checks in useApp(), each fires setState.

### P2 — useBoardDialogs returns new handler object every render

use-board-dialogs.ts: Returns a plain object `{handleProjectSelect, handleProjectCancel, ...}`.
The individual handlers use useCallback, but the containing object is new every render.
BoardCore receives this as `dialogHandlers` prop — new ref every time.

### P2 — NodeLine renders renderRich() inline without memoization

shared-components.tsx:441: `{renderRich(title)}` is called on every render.
renderRich parses markdown + applies styles — non-trivial for 200+ visible nodes.
No React.memo on NodeLine means parent re-renders cascade.

### P3 — countVisibleDescendants is O(n) recursive and unused?

Board.tsx:785-807: This function exists but may not be called in the hot path.
If called during render, it walks the tree recursively for each visible card.

### P3 — new Set<string>() in tuiBoardState factory

Board.tsx:614: `selectedCards: new Set<string>()` creates a new Set every render.
While cheap, it means shallow comparison always fails for this field.

## Fix Plan (priority order)

1. **Fix useApp() equality check** — Add Object.is comparison in the subscriber:

```tsx
store.subscribe((newState) => {
  const next = selectorRef.current(newState)
  setState(prev => Object.is(prev, next) ? prev : next)
})
```

2. **Stabilize boardState ref** — Only create new boardState when flat fields actually change.
   Compare before/after in withBoardState.
3. **Remove or debounce updateLayout write-back** — Use a ref instead of store for layout,
   or gate the write with shallow equality check.
4. **Memoize useBoardDialogs return** — Wrap in useMemo.
5. **Add React.memo to NodeLine** — Trivial win for list rendering.
6. **Consider single useAppStore call** — Read all needed values in one selector to reduce
   subscription count from 7 to 1.

