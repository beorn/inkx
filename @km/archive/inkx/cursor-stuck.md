---
mentions:
  - km
  - claude
id: "@km/inkx/cursor-stuck"
aliases:
  - km-inkx.cursor-stuck
  - km-inkx-cursor-stuck
created_by: claude:97217d5d
created_at: 2026-02-17T11:39:16Z
closed_at: 2026-02-17T11:42:51Z
owner: bjorn@stabell.org
assignee: claude:97217d5d
---

# [x] cursorMoveDown/Up stuck at wrap boundaries when stickyX=0 @km/inkx #bug #P2 @claude:97217d5d

At word-wrap boundaries, cursorMoveDown/cursorMoveUp return the same offset as the current cursor position, causing the cursor to get stuck. Root cause: cursorToRowCol assigns wrap-boundary offsets to the end of line N. cursorMoveDown targets startOffset of line N+1, which equals the end of line N. With stickyX=0, the computed position equals the current position. Fix: loop through successive lines until a different position is found.

