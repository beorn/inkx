---
mentions:
  - km
id: "@km/tui/date-not-dim"
aliases:
  - km-tui.date-not-dim
  - km-tui-date-not-dim
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:06:39Z
closed_at: 2026-02-15T08:44:14Z
owner: bjorn@stabell.org
---

# [x] Date badges should not be dimmed — show at normal brightness @km/tui #bug #P2

Date badges on nodes (due_date, etc.) are currently rendered with dimColor. They should render at normal brightness for better visibility.

**Expected:** Date text rendered without dim attribute.
**Current:** Date text is dimmed, making it hard to read.

