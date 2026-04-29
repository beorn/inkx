---
id: "@km/tui/empty-columns"
aliases:
  - km-tui.empty-columns
  - km-tui-empty-columns
created_by: claude:36393b5d
created_at: 2026-02-18T22:43:35Z
closed_at: 2026-02-19T11:07:09Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Column loading UX: show per-column loading indicator during file parse (5-10s) @km/tui #bug #P3 @claude:36393b5d

When opening a large repo (imports/asana, 73 files), the board goes through 3 phases: 1) Loading indicator (OK), 2) Columns with headers but (empty) content for 5-10s while markdown files are parsed (NOT OK — looks broken), 3) Full content loaded (OK). Fix: show skeleton/loading indicator per column during phase 2 instead of (empty). The SkeletonCards component already exists — use it when column.cards.length === 0 and isLoading is true.