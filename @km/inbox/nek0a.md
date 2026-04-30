---
id: "@km/inbox/nek0a"
aliases:
  - km-nek0a
  - "@km/_orphan/nek0a"
created_by: claude:b92140a2
created_at: 2026-03-17T08:33:07Z
closed_at: 2026-03-17T15:04:31Z
close_reason: foldersToRefresh in ReconcileContext tracks all affected parents
  for create/delete/move.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P1: Parent-folder index refresh inconsistent across lifecycle events @km/_orphan #bug #P1 @claude:b92140a2

Child create doesn't refresh parent's materialized index. Move only refreshes destination parent, not source. Delete only refreshes when deleted child was the index file itself. Stale index files until unrelated folder update. Fix: centralize affected-folder calculation, refresh all affected parents for create/delete/move.