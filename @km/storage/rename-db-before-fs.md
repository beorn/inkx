---
id: "@km/storage/rename-db-before-fs"
aliases:
  - km-storage.rename-db-before-fs
  - km-storage-rename-db-before-fs
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:47Z
closed_at: 2026-03-31T21:44:18Z
close_reason: "Fixed: renames now use synchronous renameSync with in-flight
  tracking, DB update after FS success."
---

# [x] P1: DB path updated before queued rename succeeds @km/storage #bug #P1

SyncManager's handleFolderRename/handleFileRename mutate DB fs_path/name before the WriteQueue actually executes the rename. If rename fails, DB points to nonexistent paths. Fix: make rename success observable before committing DB changes.