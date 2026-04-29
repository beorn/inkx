---
id: "@km/storage/store-sync"
aliases:
  - km-storage.store-sync
  - km-storage-store-sync
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:04Z
closed_at: 2026-04-03T07:30:45Z
close_reason: Done. withSync uses onApply subscriber instead of monkey-patch.
  skipFsSync removed. source-based filtering. Commit 8cf4760d.
---

# [x] Phase 4: sync(a, b) — bidirectional store sync @km/storage #task #P3

## Goal: withSync as commit subscriber

Current: withSync wraps emitter.apply() to intercept events and project to FS.
Target: withSync subscribes to store.onCommit() and uses CommitMeta.source to decide what to project.

### Why this matters
- Commit subscribers see ALL mutations (not just wrapped apply calls)
- Source metadata eliminates skipFsSync flags
- FS watcher imports use store.commit(events, { source: "fs-import" })
- withSync skips projection for source === "fs-import" (no echo loops)

### Migration
1. Move all callers from emitter.apply → store.commit
2. Convert withSync from apply-wrapper to onCommit subscriber
3. Remove skipFsSync from EmitOptions
4. FS watcher reconciliation uses store.commit with source metadata