---
mentions:
  - km
  - claude
id: "@km/tui/col-trunc2"
aliases:
  - km-tui.col-trunc2
  - km-tui-col-trunc2
created_by: claude:97b8de73
created_at: 2026-02-23T13:23:39Z
closed_at: 2026-02-24T08:34:38Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Column header still truncated by 1 char (FAMILY SPRIN) @km/tui #bug #P2 @claude:97b8de73

Regression of @km/tui/col-header-trunc — column header 'FAMILY SPRINT' shows as 'FAMILY SPRIN'. Previous fix (PUA icon width) didn't fully resolve. Reproduced with: km view --repo imports/asana stabell. Screenshot: Desktop/Screenshot 2026-02-23 at 13.07.43.png

