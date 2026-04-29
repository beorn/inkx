---
id: "@km/tui/signals/7-panesignals-workspace-pane-management-as-signals"
aliases:
  - km-tui.signals.7
  - km-tui-signals-7
  - "@km/tui/signals/7"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:53:00Z
closed_at: 2026-04-05T16:32:50Z
close_reason: "Acceptance: only store methods (setUI, dispatchBoard,
  openDetailPane) and handler registrations remain in WorkspaceChrome. Nav reads
  (rootPath, rootId, moveState, sel) already migrated to useFocusedPaneSignals
  in signals.4b."
---

# [x] PaneSignals: workspace/pane management as signals @km/tui #task #P3

Migrate workspace-level state (focusedPaneId, layout, panes map) from store to AppSignals. WorkspaceChrome reads via useSignal. Split/close/resize write signals directly.

Depends on signals.4 (PaneSignals type exists). ~20 useAppStore calls eliminated (mostly WorkspaceChrome).

Acceptance: grep useAppStore in WorkspaceChrome = 0 hits (except handler registration)