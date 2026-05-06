---
mentions:
  - km
  - claude
id: "@km/storage/dry-batch"
aliases:
  - km-storage.dry-batch
  - km-storage-dry-batch
created_by: claude:bca35d62
created_at: 2026-02-11T16:43:16Z
closed_at: 2026-02-11T17:04:44Z
owner: bjorn@stabell.org
assignee: claude:9b6678d0
---

# [x] Add withDeferredFs/syncToFs batch mode for bulk operations @km/storage #task #P2 @claude:9b6678d0

Add repo.withDeferredFs(fn) to pause FS sync during bulk ops, and repo.syncToFs(nodeId) to trigger single regeneration. Use in add.ts to avoid O(n^2) FS writes when linking 100+ tasks.

