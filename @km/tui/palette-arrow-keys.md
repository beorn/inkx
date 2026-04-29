---
id: "@km/tui/palette-arrow-keys"
aliases:
  - km-tui.palette-arrow-keys
  - km-tui-palette-arrow-keys
created_by: Bjørn Stabell
created_at: 2026-04-13T23:25:50Z
closed_at: 2026-04-14T20:27:30Z
close_reason: "Fixed in 83645c2b3: BoardApp now reads FocusManagerContext and
  calls installDialogGuard in a useLayoutEffect. The production path
  (createBoardApp via tui.tsx) never installed the dialog guard, so
  pushDialogMode was a no-op and currentMode() always returned 'command' —
  ArrowUp while a picker or palette was open fell through to cursor_up instead
  of dialog.nav_up. Tests didn't catch it because test helpers (board-test.ts,
  real-board.ts) install the guard via their own paths."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Arrow keys move board when command palette is open @km/tui #bug #P2 @Bjørn Stabell

When command palette (omnibox) is open, arrow keys still move the board cursor instead of navigating the search results. Likely the inDialog predicate or dialog mode push has a gap.