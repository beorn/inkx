---
id: "@km/all/pro-review-storage"
aliases:
  - km-all.pro-review-storage
  - km-all-pro-review-storage
created_by: Bjørn Stabell
created_at: 2026-03-31T21:18:41Z
closed_at: 2026-04-02T20:30:09Z
close_reason: "Grooming: all 9 children (5 P0, 4 P1) closed. Storage sync bugs
  fixed and committed."
---

# [x] Pro Review: km-storage sync pipeline — 2026-03-31 @km/all #epic #P2 @Bjørn Stabell

GPT 5.4 Pro code review of @km/storage sync pipeline (2026-03-31).
Cost: $7.16, 98K tokens, ~10 min.
Full output: /tmp/llm-manual-gpt-54-pro-code-8tbv.txt

## Dashboard: 21 findings

### P0 — Data loss / corruption (5 findings, 5 beads created)
1. @km/storage/db-events-direct-write — direct FS writes bypass sync pipeline
2. @km/storage/stop-drops-writes — SyncManager.stop() drops pending writes
3. @km/storage/cross-file-move — cross-file move only rewrites destination
4. @km/storage/reconcile-before-write-gaps — create/delete paths skip reconcile-before-write
5. @km/storage/replay-continues-after-failure — event replay continues after failure

### P1 — Silent wrong behavior (7 findings, 4 beads created)
6. @km/storage/fswriter-delete-broken — FsWriter delete broken (node already gone from DB)
7. @km/storage/rename-db-before-fs — DB path updated before queued rename succeeds
8. @km/storage/task-events-no-fs-writeback — task_claimed/released/completed never reach FS
9. @km/storage/date-writeback-regex — date write-back regex mishandles inline timestamps
10. Directory deletion uses unlinkSync (fails for folders)
11. Malformed/missing-target events silently no-op
12. syncToFs()/forceFlush() can succeed even when writes failed

### P2 — Degraded reliability (7 findings, no beads)
13. Same-content saves leave stale mtime/inode tracking
14. ensureFolderHierarchy() swallows all statSync errors
15. emit() classifies fsSync errors using only .code (brittle)
16. Deferred parsing swallows broad errors and rolls back coarse batches
17. handleFsSync is not serialized
18. Persist-before-DB in emit() is not atomic
19. last_event cursor not updated for replayed node_created

### P3 — Code quality (1 finding)
20. Legacy class-based sync pieces violate factory convention

## Suggested Fix Order (Perspective A: minimal hotfixes)
1. Delete direct FS write-through from db-events.ts
2. Flush WriteQueue on stop
3. Fix cross-file move to rewrite both files
4. Abort replay on first unexpected event failure
5. Add reconcile-before-write to create/delete regenerations
6. Fix directory delete handling

## Test Coverage Gaps Identified
12 categories of missing tests identified including: stop-before-flush, cross-file move, folder delete, FsWriter delete, concurrent external edits, direct write + SyncManager interaction, date write-back, replay failure ordering, same-content atomic save, malformed event validation, ensureFolderHierarchy errors, concurrent handleFsSync.