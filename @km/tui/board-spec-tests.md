---
id: "@km/tui/board-spec-tests"
aliases:
  - km-tui.board-spec-tests
  - km-tui-board-spec-tests
created_by: claude:ee8efc0f
created_at: 2026-02-22T00:42:38Z
closed_at: 2026-02-23T12:38:33Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Board-spec keypress tests for all commands and dialogs @km/tui #task #P2 @claude:97b8de73

Exploration found significant test gaps in board-level keypress tests. Need board-spec tests (using testEnv/board.press) for:

**Untested features (zero tests):**
- J/K block navigation (block_nav_down/up)
- Visual mode (v enter, j/k extend, d cut, y copy, Esc cancel)
- Filter dialog (j/k nav, h/l filter nav, Enter toggle, X clear, Esc cancel)
- Help overlay (j/k scroll, Esc/q dismiss)
- Focus system integration (board-area focusable, detail-pane focus)

**Partially tested:**
- Inline edit lifecycle (i enter, type, Esc cancel, Enter confirm)
- x done toggle
- u undo / Ctrl+r redo
- z zoom in / Z zoom out
- < > fold all / unfold all
- H/L fold/unfold individual
- Space select
- d cut, y copy, p paste
- Chord sequences (t+d date, g+p project picker, etc.)

Goal: comprehensive acceptance tests operating at keypress level that verify all advertised keybindings work end-to-end.