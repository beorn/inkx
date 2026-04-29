---
id: "@km/storage/cli-writeback"
aliases:
  - km-storage.cli-writeback
  - km-storage-cli-writeback
created_by: claude:ea392ebd
created_at: 2026-02-11T15:10:52Z
closed_at: 2026-02-11T18:33:46Z
---

# [x] CLI mutations don't write back to .md files (km add creates DB nodes but file never updates) @km/storage #bug #P2

CLI commands (km add, km tasks, etc.) mutate the DB via emitter.emit() but fsSync is null because no SyncManager is running. The .md file never updates. Next time the TUI opens, the file watcher re-parses the unchanged .md and the DB reverts, losing all CLI mutations.

Fix: Extract a lightweight flushFileToFs(db, nodeId, repoRoot) that finds the ancestor file node, regenerates markdown via nodesToMarkdown, and writes to disk. CLI commands call this after mutations.