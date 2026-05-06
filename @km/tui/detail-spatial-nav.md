---
mentions:
  - km
  - Bjørn
id: "@km/tui/detail-spatial-nav"
aliases:
  - km-tui.detail-spatial-nav
  - km-tui-detail-spatial-nav
created_by: Bjørn Stabell
created_at: 2026-04-06T09:30:23Z
closed_at: 2026-04-09T06:20:42Z
close_reason: Replaced virtual __meta__ KNodes with focusable React components
  in DetailView.tsx. deriveDetailColumns no longer creates virtual nodes.
  Board.tsx + board-app.ts simplified for flat detail mode. 1711 fast tests
  pass, 68 slow detail tests pass, 4 previously-failing windowing tests fixed.
  Commit 9f24941eb.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Detail pane: spatial navigation + metadata as React components (not tree nodes) @km/tui #feature #P0 @Bjørn Stabell

Replace detail pane's virtual __meta__ nodes with spatial navigation.

Currently: deriveDetailColumns creates virtual __meta__Status, __meta__Due nodes
in the tree. j/k navigates them as tree nodes.

Target: Metadata rendered as React components with focusScope. Arrow keys
navigate spatially between focusable regions (iOS/macOS style). The tree
only contains real children, navigated by the regular lens.

This eliminates:

- deriveDetailColumns function
- DETAIL_META_PREFIX virtual nodes
- The detail-mode branch in buildOpCtx
- All ColumnView usage in detail mode

Depends on silvery FocusManager spatial navigation support.

