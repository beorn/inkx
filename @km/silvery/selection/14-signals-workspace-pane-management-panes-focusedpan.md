---
id: "@km/silvery/selection/14-signals-workspace-pane-management-panes-focusedpan"
aliases:
  - km-silvery.selection.14
  - km-silvery-selection-14
  - "@km/silvery/selection/14"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:41:53Z
closed_at: 2026-04-05T07:52:31Z
owner: bjorn@stabell.org
---

# [x] Signals: workspace/pane management (panes, focusedPaneId, layout) @km/silvery #task #P3

Migrate workspace pane management from Zustand to signals.

Currently: workspace.panes (Map), workspace.focusedPaneId, workspace.layout are in the store.

Target: workspace structure as signals. Pane switching, split, close, resize write signals directly.

Lowest priority — pane operations are infrequent, Zustand overhead is negligible here.