---
id: "@km/storage/fs-rename"
aliases:
  - km-storage.fs-rename
  - km-storage-fs-rename
created_at: 2026-02-08T23:41:43Z
closed_at: 2026-02-08T23:52:44Z
---

# [x] File & folder renames: sync title edits to filesystem names @km/storage #feature #P1 @claude:dffe6eeb

When a user edits a node title in the TUI:

1. **Folder rename**: Editing folder content should rename the directory on disk and update all descendant fs_path references
2. **File rename**: Editing a file's H1 title should rename the .md file on disk (sync filename ↔ H1 title)

Current behavior: handleNodeUpdated in SyncManager silently skips folders (findFileNode returns null). File edits regenerate content but don't rename.

Fix: Add folder/file rename handling in SyncManager.handleNodeUpdated. Use WriteQueue rename operation (already supports it). Update fs_path in DB for affected nodes.