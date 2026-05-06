---
mentions:
  - km
id: "@km/tui/split-board-actions"
aliases:
  - km-tui.split-board-actions
  - km-tui-split-board-actions
created_by: claude:36393b5d
created_at: 2026-02-19T13:28:56Z
closed_at: 2026-02-19T16:17:34Z
owner: bjorn@stabell.org
---

# [x] Split board-actions.ts (1605 lines) into domain modules @km/tui #task #P3

Split board-actions.ts into:

- board-actions-dialog.ts (~450 lines): dialog show/hide/confirm/cancel/filter navigation
- board-actions-text.ts (~230 lines): TEXT_* actions and inline editing
- board-actions-property.ts (~275 lines): date, priority, recurrence, clipboard
- board-actions.ts (~200 lines): thin router with exhaustive switch

