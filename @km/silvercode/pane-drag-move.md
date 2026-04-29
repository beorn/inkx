---
id: "@km/silvercode/pane-drag-move"
aliases:
  - km-silvercode.pane-drag-move
  - km-silvercode-pane-drag-move
created_by: claude:2405c72e
created_at: 2026-04-25T07:45:31Z
closed_at: 2026-04-25T15:36:25Z
close_reason: "Implemented swapLeaves/moveLeafTo/findNeighbor pure functions in
  pane-layout.ts (4 directions + center swap, neighbor walk for
  up/down/left/right). PaneGrid renders ▤ grab handle at top-left of each leaf;
  mousedown enters move-drag mode. While dragging, the leaf under pointer shows
  a 1-cell colored band (or 2-col center band for swap) indicating drop edge
  based on quadrant. Mouse-up commits via swapLeaves or moveLeafTo.
  PaneGridHandle.cancelDrag() exposed via forwardRef so App's Escape handler can
  cancel mid-drag. Ctrl+W H/J/K/L wired in App.tsx to swap with neighbor in
  direction (vim convention). 23 tests pass: 21 unit (pane-layout-drag.test.ts)
  + 2 visual (pane-drag-move.test.tsx). tsc errors in changed files: 0 (1
  pre-existing on App.tsx:512 not introduced). Files:
  apps/silvercode/src/{pane-layout.ts,App.tsx,components/PaneGrid.tsx,component\
  s/SessionCard.tsx} + 2 new test files. Commit: 19ea18e21."
started_at: 2026-04-25T15:26:50Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.pane-drag-move
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T00:45:31Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Drag-move panes to reorder / swap / re-tile @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode]]

Drag a pane (probably via a header drag-handle, or by holding a modifier + dragging the pane body) to reorder it within the row, or to swap with another pane. Deferred from @km/silvercode/pane-management v1 — drag-resize ships in v1, drag-move waits on the header strip (@km/silvercode/pane-headers) since the natural grab handle is the header.