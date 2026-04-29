---
id: "@km/storage/generational-tokens"
aliases:
  - km-storage.generational-tokens
  - km-storage-generational-tokens
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:21Z
closed_at: 2026-04-02T22:20:58Z
close_reason: "Shipped: sync_state table with baseline_hash. Two-tier ownership:
  WriteTokenMap (in-memory fast path) + sync_state (persisted, restart-safe).
  recordProjection/recordObservation/isOurs/renamePath/renamePrefix. 13 tests.
  Commits 9bb8ac36, various wiring."
---

# [x] Persisted sync_state table with baseline hash (replaces in-memory WriteTokenMap) @km/storage #task #P2

Replace in-memory WriteTokenMap with persisted sync_state table in SQLite.

PRO RECOMMENDATION:
```sql
CREATE TABLE sync_state (
  fs_path TEXT PRIMARY KEY,
  node_id TEXT,
  baseline_hash TEXT,
  baseline_kind TEXT, -- 'projected' | 'observed'
  last_seen_mtime_ns INTEGER,
  last_error TEXT,
  dirty INTEGER NOT NULL DEFAULT 0
);
```

SEMANTICS:
- baseline_hash = 'the bytes currently on disk that correspond to current DB state'
- After DB→FS projection: set baseline to bytes km wrote
- After FS→DB reconcile: set baseline to exact bytes observed externally

WATCHER RULE:
- File changed → read bytes → hash → if hash == baseline_hash: no-op → else: parse/reconcile

WHY BETTER THAN ONE-SHOT TOKENS:
- Duplicate watcher events naturally harmless
- Restart-safe (persisted, not in-memory)
- Formatting-only external edits become new baseline without rewrite
- Collapses WriteTokenMap, pending paths, in-flight marking into one primitive

ALSO FIXES:
- Pro concern: one-shot consume-on-mismatch loses ownership for subsequent events
- Pro concern: in-memory tokens lost on crash
- Pro concern: rename should move baseline state, not re-read file

MIGRATION: WriteTokenMap stays as in-memory cache for hot path; sync_state is the durable ground truth.