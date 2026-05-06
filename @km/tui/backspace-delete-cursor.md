---
mentions:
  - km
  - Bjørn
id: "@km/tui/backspace-delete-cursor"
aliases:
  - km-tui.backspace-delete-cursor
  - km-tui-backspace-delete-cursor
created_by: Bjørn Stabell
created_at: 2026-04-03T03:27:27Z
closed_at: 2026-04-03T03:54:12Z
close_reason: Fixed in 44c25829 + a08e115e. Uses result.survivorId, atomic
  wrapper prevents recurrence.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Backspace at start of subitem deletes node but cursor jumps to card title instead of adjacent sibling @km/tui #bug #P1 @Bjørn Stabell

Repro: in text edit mode on a subitem, backspace at beginning of line.
Result: node disappears, cursor jumps to card title (parent heading).
Expected: cursor moves to previous sibling or stays on next sibling.

Error in log: InvariantViolationError cursor-exists — cursor points to deleted node ID.
The delete action removes the node but doesn't update cursor to adjacent node first.

