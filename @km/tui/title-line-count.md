---
mentions:
  - km
id: "@km/tui/title-line-count"
aliases:
  - km-tui.title-line-count
  - km-tui-title-line-count
created_by: claude:36393b5d
created_at: 2026-02-18T22:49:55Z
closed_at: 2026-02-19T08:23:55Z
owner: bjorn@stabell.org
---

# [x] Card content lines count should include title wrap lines @km/tui #bug #P3

The +/- overflow count on card borders only counts body content lines, not title lines. Long titles that wrap to multiple lines are not accounted for, causing incorrect overflow indicators. The count should include all rendered lines including wrapped title text.

