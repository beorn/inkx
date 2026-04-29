---
id: "@km/tui/fold-border-regr"
aliases:
  - km-tui.fold-border-regr
  - km-tui-fold-border-regr
created_by: claude:124bfbe5
created_at: 2026-02-12T16:50:21Z
closed_at: 2026-02-12T20:16:04Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Fold (<) bottom border disappears — regression @km/tui #bug #P4 @claude:124bfbe5

When pressing < to fold a few times in /tmp/vt, card bottom borders disappear. This was previously fixed in @km/tui/fold-border-blank (content-phase inset clipRectBottom) but appears to have regressed.