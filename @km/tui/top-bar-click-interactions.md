---
id: "@km/tui/top-bar-click-interactions"
aliases:
  - km-tui.top-bar-click-interactions
  - km-tui-top-bar-click-interactions
created_by: Bjørn Stabell
created_at: 2026-04-07T22:56:12Z
closed_at: 2026-04-07T22:56:18Z
close_reason: Shipped in same session as km-tui.column-empty-space-deselect
  (re-fix). 2 new tests in mouse-click.test.ts. 15/15 pass.
---

# [x] Top-bar click interactions: select board + open view dialog @km/tui #feature #P3 @Bjørn Stabell

After the column-empty-space deselect fix, the user has no mouse-discoverable way to re-enter 'board level' selection, and no mouse path to open the view/filter dialog.

Added two click interactions:
- Clicking the top-bar chrome (PaneBar white breadcrumb row, data-view='top-bar') → select board root (cursor=rootId, triggers rule 4 board tint)
- Clicking the 'CARDS VIEW CL:3' text in the top bar (data-view='view-mode-button') → SHOW_FILTER_DIALOG

Implementation:
- PaneBar.tsx: data-view='top-bar' on outer Box
- Board.tsx: view-mode Text wrapped in Box data-view='view-mode-button' (both single-pane and multi-pane branches)
- board-app.ts click handler: walk-up collects clickedTopBar/clickedViewModeButton flags, early-return branches dispatch before the normal selection/deselect logic
- mouse-click.test.ts: 2 new tests