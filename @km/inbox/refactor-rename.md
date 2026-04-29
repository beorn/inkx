---
id: "@km/_orphan/refactor-rename"
aliases:
  - km-refactor-rename
created_at: 2026-01-24T21:50:37Z
closed_at: 2026-01-24T22:10:34Z
---

# [x] Rename SimplifiedBoardState → BoardState in @km/board @km/_orphan #task #P2

After @km/_orphan/repl migration, rename SimplifiedBoardState to BoardState.

**Changes:**
- Rename SimplifiedBoardState → BoardState
- Rename SimplifiedBoardAction → BoardAction
- Update all imports in TUI and other consumers
- Delete old BoardState type (legacy)

**Dependencies:**
- Blocked by: @km/_orphan/refactor-repl