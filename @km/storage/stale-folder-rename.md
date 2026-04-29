---
id: "@km/storage/stale-folder-rename"
aliases:
  - km-storage.stale-folder-rename
  - km-storage-stale-folder-rename
created_at: 2026-02-09T07:41:53Z
closed_at: 2026-02-09T09:33:30Z
---

# [x] Reconciler leaves stale DB nodes after folder renames @km/storage #bug #P3

When a folder is renamed on the filesystem (e.g., notes/ → notes-v1/), reconcileDirectoryRecursive detects file renames via inode matching and creates new nodes at the new paths, but does not clean up the old folder/file nodes at the old paths. This leaves stale DB nodes that reference paths no longer on disk.

Discovered by lifecycle-fuzz.fuzz.ts — fuzz auto-shrinking shows a single folder_rename triggers the issue.

Two sub-issues:
1. **Stale nodes**: Old fs_path entries remain in the DB after folder renames (data not lost, just duplicated)
2. **Orphaned parent_ids**: Child nodes may reference parent_id of a folder node that was replaced rather than updated

Impact: Mostly cosmetic — no data loss (FS→DB direction is correct). But stale nodes could confuse the TUI if it shows deleted paths.