---
mentions:
  - km
id: "@km/tui/empty-board-edit"
aliases:
  - km-tui.empty-board-edit
  - km-tui-empty-board-edit
created_by: Bjørn Stabell
created_at: 2026-03-31T01:56:25Z
owner: bjorn@stabell.org
---

# [ ] [bug] Can't add content to empty board — Enter should create first column/card @km/tui #bug #P2

## Problem

When navigating to a node with no children (e.g., a new journal file with only
an H1 heading), the board shows "(empty board)" with no way to add content.
The cursor has nothing to land on, so o/O/Enter don't work.

## Expected Behavior

Enter should work progressively:

1. On the root node title → edit the title
2. Enter again → create first column (heading) below
3. Enter on a column → create first card under it
4. Enter on a card → edit it, Enter again → create sibling

## Root Cause

Empty boards have no columns and no cards, so there's no cursor position.
The entire action system assumes a cursor exists. Need a "create first child"
action that works without a cursor position.

## Design

When the board is empty (0 columns, 0 cards):

- Cursor should be on the root node (shown as board title)
- Enter → inline edit the title
- o → create first child (becomes a column/heading)
- After first column exists, cursor moves to it, normal flow resumes

This matches Workflowy/Notion behavior where you can always type at the cursor,
even in an empty document.

