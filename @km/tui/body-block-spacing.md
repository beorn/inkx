---
id: "@km/tui/body-block-spacing"
aliases:
  - km-tui.body-block-spacing
  - km-tui-body-block-spacing
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:51:37Z
closed_at: 2026-02-16T11:54:02Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Context-dependent body block rendering: cards (compact) vs columns (spaced, no border) @km/tui #feature #P3 @claude:a5c7f7de

Body blocks render borderless by default, bordered only when selected or editing.

**Unselected, not editing**: No border — just content with left padding. One blank line between adjacent body blocks.

**Selected (cursor on it)**: Yellow border appears (matching regular card selection).

**Editing**: Cyan border appears (focus ring). Border disappears when edit ends.

**Vertical space savings**: Adjacent unselected body blocks separated by 1 blank line (not 2 lines of border overhead). Current top+bottom borders of adjacent cards = 2 lines. New: 1 blank line = 1 line.

**Dim when unselected**: Body block content dimmed when not selected (keep current behavior).

**Cards view compactContent**: Inside a card, body blocks collapse blank lines (keep current behavior).

**Column header**: Virtual body column header: not bold, dimmed when cursor not on header (keep current behavior).