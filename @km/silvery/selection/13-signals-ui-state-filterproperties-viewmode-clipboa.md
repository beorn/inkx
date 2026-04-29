---
id: "@km/silvery/selection/13-signals-ui-state-filterproperties-viewmode-clipboa"
aliases:
  - km-silvery.selection.13
  - km-silvery-selection-13
  - "@km/silvery/selection/13"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:41:52Z
closed_at: 2026-04-05T07:52:30Z
---

# [x] Signals: UI state (filterProperties, viewMode, clipboard, dialogs) @km/silvery #task #P3

Migrate per-pane UI state from Zustand to signals.

Currently: PaneUI fields (filterProperties, viewMode, maxContentLines, columnScrollAnchor, clipboard, etc.) are in the store, read via useAppStore, written via setUI.

Target: each PaneUI field is a signal. Components read directly. setUI writes signals.

Lower priority — these are less performance-sensitive than cursor/nav state.