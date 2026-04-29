---
id: "@km/tui/reimport-stale-sections"
aliases:
  - km-tui.reimport-stale-sections
  - km-tui-reimport-stale-sections
created_by: claude:8f007ba9
created_at: 2026-02-19T19:11:46Z
closed_at: 2026-02-19T22:58:43Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Re-import to remove 30 stale (no section) nodes from Asana data @km/tui #task #P4 @claude:8f007ba9

The import fix (skip no-section/untitled headers) only applies to new imports. Existing DB has 30 oi nodes with title '(no section)'. Fix: re-run the Asana import to regenerate clean data.