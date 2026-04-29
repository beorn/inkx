---
id: "@km/tui/title-truncation"
aliases:
  - km-tui.title-truncation
  - km-tui-title-truncation
created_by: claude:36393b5d
created_at: 2026-02-19T15:41:11Z
closed_at: 2026-02-19T17:01:52Z
owner: bjorn@stabell.org
---

# [x] Detail pane shows truncated title (FAMILY instead of FAMILY SCHEDULE) @km/tui #bug #P2

Column header shows 'FAMILY SCHEDUL' (off-by-one, related to @km/silvery-legacy/border-box). Detail pane title shows just 'FAMILY' instead of 'FAMILY SCHEDULE' — much more severely truncated. Likely getNodeDisplayName() or text pipeline stripping/splitting on spaces or some other processing error. The column header off-by-one is a known inkx border text overflow issue.