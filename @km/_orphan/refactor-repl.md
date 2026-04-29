---
id: "@km/_orphan/refactor-repl"
aliases:
  - km-refactor-repl
created_at: 2026-01-24T21:50:30Z
closed_at: 2026-01-24T21:59:38Z
---

# [x] Migrate km-repl away from legacy BoardState @km/_orphan #task #P1 @beorn-14119

@km/_orphan/repl currently uses legacy BoardState from @km/board, which blocks further cleanup.

**Current usage:**
- treeRenderer.tsx: Uses BoardState for shell debugging
- shellExecutor.ts: Uses boardReducer for shell commands
- commandParser.ts, commands.ts: Uses BoardAction types

**Goal:**
Migrate @km/_orphan/repl to use TUIBoardState or remove board state dependency entirely if not needed.

**Blockers this resolves:**
- Phase 2b: Rename SimplifiedBoardState → BoardState
- Phase 3: Delete board-reducer-legacy.ts
- Phase 5: Delete unused @km/board helpers