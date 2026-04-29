---
id: "@km/storage/relative-paths"
aliases:
  - km-storage.relative-paths
  - km-storage-relative-paths
created_at: 2026-02-08T13:46:27Z
closed_at: 2026-02-08T15:00:04Z
assignee: claude:dffe6eeb
---

# [x] fs_path should be relative to repo root for portable repos @km/storage #bug #P1 @claude:dffe6eeb

fs_path in the nodes table stores absolute paths (e.g. /Users/beorn/Bear/Vault/@inbox.md). When a repo is moved/copied to a new location, all fs_path values become stale. Edits in the TUI silently fail to write back because the paths don't match the new location.

Fix: Store paths relative to repo root in the DB. Resolve to absolute at runtime by prepending repo.path. This affects:
- packages/@km/storage/src/store.ts (file scanning, path storage)
- packages/@km/storage/src/watch/sync.ts (handleNodeUpdated, handleNodeCreated, etc.)
- packages/@km/storage/src/watch/writequeue.ts (executeOp)
- Any code reading fs_path from the DB

Test: Create a repo at path A, move/copy it to path B, verify edits in TUI write to path B files.