---
id: "@km/tui-nav/4-remove-transitionalboardaction-type"
aliases:
  - km-tui-nav.4
  - km-tui-nav-4
  - "@km/tui-nav/4"
created_at: 2026-01-24T22:35:11Z
closed_at: 2026-01-24T22:47:10Z
---

# [x] Remove TransitionalBoardAction type @km/tui-nav #task #P2

Once all legacy actions are removed, TransitionalBoardAction is no longer needed.

1. Change all Dispatch<TransitionalBoardAction> to Dispatch<BoardAction>
2. Remove TransitionalBoardAction from @km/board exports
3. Run tests to verify

Files to update:
- packages/@km/_orphan/board/src/board-types.ts
- packages/@km/_orphan/board/src/index.ts
- apps/@km/tui/src/tui-context.ts
- apps/@km/tui/src/views/board-input.ts
- apps/@km/tui/src/views/board-effects.ts
- apps/@km/tui/src/views/Board.tsx