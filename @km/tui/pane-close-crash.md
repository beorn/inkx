---
id: "@km/tui/pane-close-crash"
aliases:
  - km-tui.pane-close-crash
  - km-tui-pane-close-crash
created_by: Bjørn Stabell
created_at: 2026-04-06T19:54:30Z
closed_at: 2026-04-06T20:08:26Z
close_reason: "Fixed: 316077e0b — block closing last board pane + zombie child
  guard in usePaneSignals"
owner: bjorn@stabell.org
---

# [x] [bug] vw pane close crashes app — usePaneSignals: no PaneSignals for pane main @km/tui #bug #P0

Repro: vs → s (vsplit) → vw (close pane). Crash: usePaneSignals throws because Board component renders after workspace removes the pane. State persists to disk, requiring DB deletion to recover.

Stack: usePaneSignals → Board.tsx:601 → React mountState → useApp.

Root cause: When pane is closed, workspace.panes is updated but Board component still renders and calls usePaneSignals() which throws because there are no board panes with signals left.