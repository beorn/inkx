---
id: "@km/inbox/byf0z"
aliases:
  - km-byf0z
  - "@km/_orphan/byf0z"
created_by: Bjørn Stabell
created_at: 2026-04-01T06:10:18Z
closed_at: 2026-04-02T04:14:56Z
close_reason: "Fixed: directory deletion now uses rmSync with recursive:true.
  writequeue.ts stats path before delete — dirs get rmSync, files get
  unlinkSync. Commit 849afdef."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Folder deletion uses unlinkSync which fails on directories (EISDIR) @km/_orphan #bug #P0 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/event-handlers.ts:205-230
Classification: P0

handleNodeDeleted() sends both file and folder item deletions through deleteFile(). In SyncManager, that maps to WriteQueue.queueDelete() -> unlinkSync(), which fails on directories (EISDIR). Result: deleting a folder node leaves the directory on disk, and watcher/heartbeat can recreate it.

Suggested fix: Split FsWriteTarget into deleteFile() and deleteDirectory(). For folders, use fs.rmSync(path, { recursive: true, force: true }).