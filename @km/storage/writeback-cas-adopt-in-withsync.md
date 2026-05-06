---
mentions:
  - km
  - claude
id: "@km/storage/writeback-cas-adopt-in-withsync"
aliases:
  - km-storage.writeback-cas-adopt-in-withsync
  - km-storage-writeback-cas-adopt-in-withsync
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:35:55Z
closed_at: 2026-04-22T18:12:36Z
close_reason: "Shipped commit c71f9dc3b. withSync now uses safeWriteFile via
  pluggable writeImpl config. Deleted ~330 LOC of home-grown baseline-hash check
  + conflict-backup flow. echoGuard threaded through reconciliation-engine as
  Layer-0 fast-path. save() race fixed via split
  updateBaselineHash/updateContentBaseline. Tests:
  withsync-safe-write.slow.test.ts (3), withsync-echo-guard.slow.test.ts (2),
  writequeue.test.ts rewritten (78 tests)."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.writeback-cas-adopt-in-withsync
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T08:35:55Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Adopt safe-write + echo-guard in withSync path (TUI writer) @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The writeback-cas bead (closed 2026-04-22) shipped safeWriteFile/writeFileAtomic/createEchoGuard and wired them into withFsWriter (CLI one-shot path). withSync (TUI long-running) has its own WriteQueue baseline-hash check and was explicitly deferred.

## Scope

- Audit withSync's WriteQueue baseline-hash check; identify the overlap with safeWriteFile
- Decide: replace WriteQueue mechanism with safeWriteFile+echoGuard, OR unify the two behind a shared interface
- Ensure TUI writeback gets the same content-as-CAS contract as CLI

## /complete

- TUI writeback uses safeWriteFile
- Concurrent-edit test: user edits file externally during TUI session → conflict_created fires, TUI never silent-overwrites
- Echo guard adopted: watcher no longer fires on TUI's own writes

