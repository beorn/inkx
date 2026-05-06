---
mentions:
  - km
  - Bjørn
id: "@km/storage/move-disk"
aliases:
  - km-storage.move-disk
  - km-storage-move-disk
created_by: Bjørn Stabell
created_at: 2026-04-01T06:11:20Z
closed_at: 2026-04-02T21:41:00Z
close_reason: "Fixed: handleNodeMoved now detects file/folder items, performs
  fs.rename, updates fs_path, cascades for folder descendants. Guards for
  target-exists, source-missing, same-path. Uses markInFlight + write tokens. 3
  integration tests. Commit 7a568cb3."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] handleNodeMoved doesn't handle moving file/folder items on disk @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/event-handlers.ts:255-317
Classification: P1

handleNodeMoved() only regenerates source/destination markdown files. If the moved node itself is a file or folder item, no filesystem move occurs and fs_path is not recalculated/cascaded. DB parentage and disk layout diverge.

Suggested fix: Special-case item moves (node.item === true with file/folder fstype). Compute new path from destination folder, perform rename/mkdir, update/cascade fs_path, dirty affected index files.

