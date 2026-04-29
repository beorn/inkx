---
id: "@km/_orphan/cdt25"
aliases:
  - km-cdt25
created_by: claude:8f007ba9
created_at: 2026-02-19T21:25:14Z
closed_at: 2026-02-19T21:44:51Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Show subtask/comment counts on cards @km/_orphan #feature #P3 @claude:8f007ba9

Asana cards show numeric subtask indicators (3/7 done) and comment bubble with count. km shows fold markers (filled/empty dots) but no count, and has no card-level comment indicator. Data already exists — childCount is derived at render time, comments are child nodes under detailOnly parent.