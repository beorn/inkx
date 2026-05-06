---
mentions:
  - km
  - claude
id: "@km/inkx/splitview"
aliases:
  - km-inkx.splitview
  - km-inkx-splitview
created_by: claude:d3a7049b
created_at: 2026-02-22T07:35:48Z
closed_at: 2026-02-22T08:54:29Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] inkx: SplitView component + PaneManager for generic pane tiling @km/inkx #task #P2 @claude:d3a7049b

Reusable inkx module for terminal pane management. PaneManager (layout tree, pane CRUD, focus routing), SplitView component (renders binary split tree with borders), PaneHost component (bordered container with [id] title). Resize handling (keyboard + mouse drag). This is the inkx-layer part of windowing — generic, not @km/_orphan/specific.

