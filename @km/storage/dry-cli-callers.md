---
id: "@km/storage/dry-cli-callers"
aliases:
  - km-storage.dry-cli-callers
  - km-storage-dry-cli-callers
created_by: claude:bca35d62
created_at: 2026-02-11T16:43:10Z
closed_at: 2026-02-11T17:03:36Z
---

# [x] Migrate CLI commands to use Repo mutation methods @km/storage #task #P2 @claude:9b6678d0

Replace emitNodeCreatedWithEmitter/emitNodeUpdatedWithEmitter calls with repo.addNode()/repo.updateNode() in: add.ts, tasks/mutations.ts, tasks/set-clear.ts. Fixes @km/storage/add-no-writeback bug.