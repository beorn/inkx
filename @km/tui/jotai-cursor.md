---
id: "@km/tui/jotai-cursor"
aliases:
  - km-tui.jotai-cursor
  - km-tui-jotai-cursor
created_by: claude:23485adf
created_at: 2026-02-23T17:09:28Z
closed_at: 2026-03-04T00:46:32Z
---

# [x] Phase 6: merge CursorStore into Jotai atoms @km/tui #task #P3 @claude:f47d1ff0

Replace CursorStore consumers (useIsCursorAtNode, useIsColumnSelectedByNode, useCursorCardNodeId, etc.) with Jotai atom reads. CursorStore remains as imperative state holder; Board.tsx already syncs to Jotai atoms. Touches ~10 files (CardColumn, ScrollTracker, ColumnsView, CommandBox, Board, etc.).