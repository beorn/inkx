---
id: "@km/silvery/selection/4-per-pane-selection-stores-replace-cursornodeid-wit"
aliases:
  - km-silvery.selection.4
  - km-silvery-selection-4
  - "@km/silvery/selection/4"
created_by: Bjørn Stabell
created_at: 2026-04-04T17:37:33Z
closed_at: 2026-04-05T08:00:51Z
---

# [x] Per-pane selection stores — replace cursorNodeId with per-pane sel instances @km/silvery #task #P1 @Bjørn Stabell

Currently sel is a global store but cursorNodeId is per-pane in BoardPaneState (304 references). Multi-pane support requires each pane to have its own selection store instance.

## What changes
- Each BoardPaneState gets its own sel = createSelection(app)
- cursorNodeId removed from BoardPaneState — sel.node.cursor replaces it
- Workspace manages multiple sel instances, routes input to active pane sel
- sel.root replaces the per-pane rootId concept

## Depends on
- P3 migration complete (done)
- Understanding of multi-pane interaction (which pane gets keyboard input, how focus routing works between panes)

## Acceptance
grep -r "cursorNodeId" apps/@km/tui/src/ → 0 hits