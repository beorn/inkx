---
id: "@km/_orphan/sxxk"
aliases:
  - km-sxxk
created_at: 2026-01-20T16:40:36Z
closed_at: 2026-01-20T16:54:43Z
---

# [x] Sync doesn't detect file content changes when mtime is older than updated_at @km/_orphan #bug #P2

When a file's mtime is older than the node's updated_at timestamp in the database, the sync doesn't detect the file as modified.

**Repro:**
1. Have a file that's been synced
2. Modify the file externally (e.g., editor doesn't update mtime properly, or timestamp weirdness)
3. Run `km sync`
4. Changes aren't detected because `mtime > updated_at` check fails

**Root cause:**
In reconcile.ts line 94: `entry.mtime > existingByPath.updated_at`

This fails when the file was modified but its mtime is somehow older than the DB's updated_at (e.g., due to previous syncs updating the DB timestamp without the file mtime changing).

**Workaround:**
Delete .km folder and re-sync from scratch

**Potential fixes:**
1. Also check content hash to detect changes
2. Compare mtime against a stored file_mtime column (not the node's updated_at)
3. Always re-parse if content hash doesn't match