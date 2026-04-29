---
id: "@km/all/boardstate-unify"
aliases:
  - km-all.boardstate-unify
  - km-all-boardstate-unify
created_by: Bjørn Stabell
created_at: 2026-04-02T01:32:33Z
closed_at: 2026-04-02T01:56:28Z
close_reason: "Consolidated: km-tui re-exports from @km/board (canonical). Moved
  selectedNodes/maxContentLines out of BoardState (they're per-pane UI state).
  Added SET_COLLAPSED_NODES to canonical definition. km-repl kept separate with
  comment explaining why (tree-in-state paradigm). 196 test files, 5220 tests
  pass."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Consolidate 3 drifted BoardState definitions into one @km/all #task #P2 @Bjørn Stabell

Three separate BoardState interfaces have drifted:
1. packages/@km/_orphan/board/src/board-types.ts — canonical, used by board-reducer-new
2. apps/@km/tui/src/board-types.ts — TUI copy, added SET_COLLAPSED_NODES, removed selectedNodes/maxContentLines
3. apps/@km/_orphan/repl/src/board-types.ts — REPL copy, fundamentally different (tree-in-state: nodes: TNode[], cursor: TPath)

The @km/_orphan/board and @km/tui copies should be unified. The @km/_orphan/repl copy is a separate concern (it may need its own type).

IMPACT: Eliminates silent drift bugs where one definition adds a field and the other doesn't.