---
id: "@km/tui/unify-state"
aliases:
  - km-tui.unify-state
  - km-tui-unify-state
created_by: claude:36393b5d
created_at: 2026-02-19T13:38:14Z
closed_at: 2026-02-19T16:17:33Z
---

# [x] Unify all state into single Zustand store @km/tui #task #P2

Consolidate 3 state layers into one Zustand store:

1. ABSORB CursorStore (cursor-store.ts) — cursorNodeId moves to Zustand. Components use useStore(s => s.cursorNodeId) selector to avoid re-renders. Delete cursor-store.ts, cursor-context.tsx CursorStoreProvider.

2. ABSORB UI Reducer (ui-reducer.ts) — searchQuery, searchMode, helpMode, navHistory, viewMode etc. move to Zustand. Board.tsx useReducer replaced with store selectors. Delete ui-reducer.ts dispatch mechanism.

3. STORE derived state (not derive on every render) — columns and cursorPosition recomputed via Zustand subscribeWithSelector when rootId/foldedNodes/repo.version change. No more deriveColumnsFromRepo() on every render.

Result: one AppState interface, one store, selectors for performance. Clean up dead ActionCtx fields, remove ColumnsLayoutContext, simplify Board.tsx connector.