---
mentions:
  - km
id: "@km/storage/reconcile-before-write-gaps"
aliases:
  - km-storage.reconcile-before-write-gaps
  - km-storage-reconcile-before-write-gaps
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:24Z
closed_at: 2026-03-31T21:43:27Z
close_reason: "Fixed: handleNodeCreated and handleNodeDeleted now reconcile
  before writing, matching handleNodeUpdated pattern."
owner: bjorn@stabell.org
---

# [x] P0: create/delete paths skip reconcile-before-write @km/storage #bug #P0

handleNodeCreated and handleNodeDeleted in SyncManager regenerate parent files without calling reconcileIfChanged first. External edits to those files can be silently overwritten. Fix: use reconcileFirst=true consistently for all file rewrite paths.

