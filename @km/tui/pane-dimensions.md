---
id: "@km/tui/pane-dimensions"
aliases:
  - km-tui.pane-dimensions
  - km-tui-pane-dimensions
created_by: claude:28b14b32
created_at: 2026-02-23T09:31:37Z
closed_at: 2026-02-23T10:04:05Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Split panes: Board uses full terminal width, second pane invisible @km/tui #bug #P2 @claude:28b14b32

When splitting panes (Ctrl+W v), the second pane gets zero visible space because Board.tsx hardcodes termWidth=dimensions.columns (full terminal width, e.g. 120). In a 50/50 split, each pane's flexBasis is 50% but the Board content inside pane 1 renders at 120 cols, pushing pane 2 completely off-screen.

Root cause: Board.tsx line 315: const termWidth = dimensions.columns — always the full terminal width. Used for: top bar width, column widths, dialog positioning, everything.

Fix: Board should derive its available width from the pane container (e.g. useContentRect() or context-provided pane dimensions) instead of storeDimensions.

Tests pass because the test renderer uses small fixed dimensions where 50% still fits.

Verified via TTY: omnibox > Split Vertical creates the split layout (pane [1] label appears, border visible) but pane 2 is invisible. Raw text confirms pane 1 occupies all 120 cols x 40 rows.