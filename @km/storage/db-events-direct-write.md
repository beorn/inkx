---
id: "@km/storage/db-events-direct-write"
aliases:
  - km-storage.db-events-direct-write
  - km-storage-db-events-direct-write
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:15Z
closed_at: 2026-03-31T21:43:24Z
close_reason: "Fixed: removed all direct Bun.write() from db-events.ts. Task
  events now flow through SyncManager/FsWriter. No more racing write paths."
owner: bjorn@stabell.org
---

# [x] P0: db-events.ts direct FS writes bypass sync pipeline @km/storage #bug #P0

db-events.ts writeTaskStatusToFile() and writeDateToFile() write directly to filesystem, bypassing SyncManager/WriteQueue. This causes: (1) two uncoordinated writers for the same event, (2) watcher seeing direct writes as external changes, (3) lost updates from race conditions. Fix: remove direct FS writes from db-events.ts, route all DB->FS propagation through FsSync.