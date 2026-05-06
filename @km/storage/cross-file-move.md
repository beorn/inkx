---
mentions:
  - km
id: "@km/storage/cross-file-move"
aliases:
  - km-storage.cross-file-move
  - km-storage-cross-file-move
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:21Z
closed_at: 2026-03-31T21:43:26Z
close_reason: "Fixed: node_moved now includes old_parent_id and regenerates both
  source and destination files."
owner: bjorn@stabell.org
---

# [x] P0: cross-file node_moved only rewrites destination file @km/storage #bug #P0

When a node is moved between files, handleNodeMoved() only regenerates the destination file. The source file retains the old content, creating duplicates on disk. Fix: capture old_parent_id/old_file_id before the move, regenerate both source and destination files.

