---
mentions:
  - km
id: "@km/storage/task-status-empty-string"
aliases:
  - km-storage.task-status-empty-string
  - km-storage-task-status-empty-string
created_by: claude:adeac868
created_at: 2026-04-25T06:00:13Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] Bullets in calendar files parse as nodes with task_status='' (empty, not NULL) @km/storage #chore #P3

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Bullets in calendar files (date-only headings, prose calendar lines that *look* like tasks) get parsed as nodes with task_status = '' (empty string, not NULL). /due filters these out explicitly.

## Design question

Should the parser apply stricter 'is this really a task' detection, or is the empty-status escape hatch the right model and consumers should always filter?

