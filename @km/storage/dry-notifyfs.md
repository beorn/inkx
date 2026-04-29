---
id: "@km/storage/dry-notifyfs"
aliases:
  - km-storage.dry-notifyfs
  - km-storage-dry-notifyfs
created_by: claude:bca35d62
created_at: 2026-02-11T16:43:03Z
closed_at: 2026-02-11T17:02:10Z
owner: bjorn@stabell.org
assignee: claude:9b6678d0
---

# [x] Remove double-FS-write (notifyFs) from Repo mutation methods @km/storage #task #P2 @claude:9b6678d0

In disk mode, DbOps calls emitter.emit({db}) which runs fsSync (step 4). Then Repo's notifyFs() calls fsSync.applyEventToFs() again — double FS write. Remove notifyFs() and its calls from addNode, updateNode, moveNode, deleteNode.