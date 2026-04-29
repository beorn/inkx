---
id: "@km/storage/dry-mutations"
aliases:
  - km-storage.dry-mutations
  - km-storage-dry-mutations
created_by: claude:bca35d62
created_at: 2026-02-11T16:42:49Z
closed_at: 2026-02-11T17:47:09Z
---

# [x] DRY mutation pipeline: single consistent path for all callers @km/storage #task #P2 @claude:9b6678d0

Two mutation paths exist: (1) Repo methods → DataStore → DbOps → emitter.emit({db}) → full pipeline (correct), (2) Direct emitter helpers (emitNodeCreatedWithEmitter) → emitter.emit() without {db} → broken (no DB write, no FS writeback). Route all CLI commands through Repo methods, fix double-FS-write, add batch mode for bulk ops.