---
id: "@km/storage/consistency-heartbeat"
aliases:
  - km-storage.consistency-heartbeat
  - km-storage-consistency-heartbeat
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:25Z
closed_at: 2026-04-02T22:30:12Z
close_reason: "Shipped: reprojectDirtyPaths() runs after heartbeat — regenerates
  FS from DB for dirty paths. clearDirty() on sync_state. Permanent WriteQueue
  errors mark paths dirty. ~25 lines added to heartbeat cycle."
---

# [x] FS-DB consistency heartbeat with idempotent replay @km/storage #task #P2

If WriteQueue fails permanently (ENOSPC, EACCES), DB has the change but file doesn't. No recovery mechanism exists.

DESIGN: Enhanced heartbeat that:
1. Compares DB state with FS for each file (not just mtime check)
2. Re-projects any mismatches (idempotent — safe to replay)
3. Stores write intent in events.jsonl so failed writes are retried
4. Runs every 60s regardless of idle state (current heartbeat only runs when idle 30s+)

BENEFIT: Automatic recovery from lost writes, disk-full, permission errors.