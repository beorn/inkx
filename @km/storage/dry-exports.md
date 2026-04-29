---
id: "@km/storage/dry-exports"
aliases:
  - km-storage.dry-exports
  - km-storage-dry-exports
created_by: claude:bca35d62
created_at: 2026-02-11T16:43:21Z
closed_at: 2026-02-11T17:05:14Z
owner: bjorn@stabell.org
assignee: claude:9b6678d0
---

# [x] Remove dead emitNode*WithEmitter re-exports @km/storage #task #P3 @claude:9b6678d0

After migrating CLI callers, remove emitNodeCreatedWithEmitter, emitNodeUpdatedWithEmitter, emitNodeMovedWithEmitter, emitNodeDeletedWithEmitter from @km/storage/src/index.ts re-exports. Keep underlying emitNodeCreated etc. in emitter.ts (used by DbOps).