---
mentions:
  - km
id: "@km/tui/tree-lenses/9-delete-column-based-buildnodeindex-derivecursorind"
aliases:
  - km-tui.tree-lenses.9
  - km-tui-tree-lenses-9
  - "@km/tui/tree-lenses/9"
created_by: Bjørn Stabell
created_at: 2026-04-06T06:35:56Z
closed_at: 2026-04-06T06:42:15Z
close_reason: Board.tsx, board-app.ts, driver.ts all use deriveColumnsFromLens +
  buildNodeIndexFromTree. The column-based buildNodeIndex +
  deriveColumnsFromRepo remain as test-only helpers — they'll be deleted in .10
  along with the legacy pipeline.
owner: bjorn@stabell.org
---

# [x] Delete column-based buildNodeIndex + deriveCursorIndices — use tree versions only @km/tui #task #P2

Board.tsx and buildOpCtx both have buildNodeIndexFromTree available. Delete buildNodeIndex (column version) entirely and switch both to the tree version. Same for deriveCursorIndices.

