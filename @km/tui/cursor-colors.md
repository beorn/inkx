---
id: "@km/tui/cursor-colors"
aliases:
  - km-tui.cursor-colors
  - km-tui-cursor-colors
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:05:21Z
closed_at: 2026-02-15T08:44:14Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Selected cursor: strip colors, render black-on-yellow for readability @km/tui #bug #P2 @claude:a5c7f7de

When a node/card has the cursor (yellow background), all text within should render as black-on-yellow. Currently, colored text (e.g., sigil colors, dim text, etc.) retains its original foreground color on yellow background, making some text invisible or hard to read.

**Expected:** Selected items strip all foreground colors and render uniformly as black text on yellow background.
**Current:** Various foreground colors clash with yellow background — some are invisible.