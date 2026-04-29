---
id: "@km/_orphan/legacy-cleanup"
aliases:
  - km-legacy-cleanup
created_at: 2026-01-24T23:11:32Z
closed_at: 2026-01-24T23:27:35Z
---

# [x] Remove all legacy/compat code from board refactor @km/_orphan #task #P2

Clean up remaining legacy code after board architecture refactor:

1. Remove handleKey() function (apps/@km/tui/src/state.ts:632) - only used in 40 test files
2. Remove or refactor TUIBoardState - duplicates BoardState + columns data
3. Clean up ZOOM_IN action dispatches - remove unused nodes/cursor params (6+ places)
4. Remove buildTreeNodes() calls where TNode[] is unused
5. Remove compatibility comments ('for backward compatibility', 'legacy', etc.)
6. Consider phasing out board-adapter.ts entirely

Goal: Zero legacy/compat/fallback code. Everything should be production-quality.