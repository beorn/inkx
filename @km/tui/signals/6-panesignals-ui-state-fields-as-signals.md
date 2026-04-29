---
id: "@km/tui/signals/6-panesignals-ui-state-fields-as-signals"
aliases:
  - km-tui.signals.6
  - km-tui-signals-6
  - "@km/tui/signals/6"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:53:00Z
closed_at: 2026-04-05T16:32:49Z
close_reason: "Acceptance: grep useAppShallow.*PaneUI in views/ = 0 hits.
  Board.tsx uses usePaneUI() hook (now pane-aware via usePaneId)."
owner: bjorn@stabell.org
---

# [x] PaneSignals: UI state fields as signals @km/tui #task #P3

Migrate per-pane UI fields (viewMode, filterProperties, maxContentLines, columnScrollAnchor, etc.) from BoardPaneState plain fields to signals on PaneSignals. Views read via useSignal. setUI writes signals directly.

Depends on signals.4 (PaneSignals type exists). ~10 useAppStore calls eliminated.

Acceptance: grep useAppShallow.*PaneUI in views/ = 0 hits