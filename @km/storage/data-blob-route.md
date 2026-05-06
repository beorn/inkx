---
mentions:
  - km
  - claude
id: "@km/storage/data-blob-route"
aliases:
  - km-storage.data-blob-route
  - km-storage-data-blob-route
created_by: claude:499eee95
created_at: 2026-02-13T22:16:38Z
closed_at: 2026-02-13T22:29:45Z
owner: bjorn@stabell.org
assignee: claude:499eee95
---

# [x] SQLiteError: no such column: due_time — data-blob fields crash updateNode @km/storage #bug #P1 @claude:499eee95

board-actions.ts passes data-blob fields (due_time, scheduled_time, etc.) as top-level keys to updateNode. The db-ops and db-events SQL generators try SET due_time=? but due_time is not a SQL column — it's in the data JSON blob. Fix: define SCHEMA_COLUMNS set in schema.ts, route non-column KNode fields to data blob in both updateNodeImpl and applyNodeUpdated.

