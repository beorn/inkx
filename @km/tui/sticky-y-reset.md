---
mentions:
  - km
  - claude
id: "@km/tui/sticky-y-reset"
aliases:
  - km-tui.sticky-y-reset
  - km-tui-sticky-y-reset
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:51:08Z
closed_at: 2026-02-15T00:00:53Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Non-successful cursor action at board level should reset stickyY @km/tui #bug #P3 @claude:a5c7f7de

When cursor is on board level and user presses h/l (left/right) or tries to move up (k), the action fails with boundary result. Currently stickyY is preserved from the last successful navigation, which means the next time the user navigates into a column, cursor may jump to an unexpected Y position. stickyY should be reset to null on any non-successful navigation action so cursor starts fresh.

