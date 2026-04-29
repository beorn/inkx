---
id: "@km/storage/sync-test-gaps"
aliases:
  - km-storage.sync-test-gaps
  - km-storage-sync-test-gaps
created_by: Bjørn Stabell
created_at: 2026-03-31T21:14:04Z
closed_at: 2026-03-31T21:58:18Z
close_reason: "9 fault injection tests written: reconcile failure (2),
  cross-file move (2), event replay cascade (4), delete ordering (1). Plus 4
  existing tests verified. All 1045+ tests pass."
owner: bjorn@stabell.org
---

# [x] Close 10 sync pipeline silent failure test gaps @km/storage #task #P2

## Context

Audit of km's sync pipeline found 17 silent failure modes (4 critical, 6 high).
The existing test suite (~1034 tests in @km/storage) failed to catch ANY of them.
This bead tracks closing all 10 identified test gaps.

## Root Cause Analysis

The test suite has three structural blind spots:

1. **Happy-path-only testing**: 100% of sync/chaos tests verify correct behavior. Zero tests inject errors (throwing listeners, disk errors, corrupt files) to verify error handling paths.

2. **Layer boundary bypass**: Tests use in-memory DB + mock FS but never test the ACTUAL write-back path (db-events.ts writeTaskStatusToFile). The Bun.write() fire-and-forget call was never exercised by any test.

3. **No integration between emitter callbacks**: The emitter has 4 steps (persist, db apply, broadcast, fsSync) but no test ever wired both an EventHub AND FsSync simultaneously to verify isolation.

## Test Gaps (10 findings)

### Done (F1, F2) — emitter.test.ts + db-writeback.test.ts

- F1: Emitter error isolation — broadcast error, fsSync I/O error, programming error re-throw, step ordering
- F2: Task status write-back — checkbox update, parent file walk-up, missing file, out-of-range md_line
- F3: Bun.write() fire-and-forget — concurrent writes race condition documented

### Remaining (F4-F10)

| ID | Finding | Severity | Test Category | Where to Add |
|----|---------|----------|---------------|-------------|
| F4 | INSERT OR IGNORE silently drops node_created on ID collision | High | ID collision: create two nodes with same path-based ID, verify second is rejected with warning (not silently dropped) | reconcile.test.ts |
| F5 | Hash-match skips mtime update -> infinite re-reconciliation | Critical | Round-trip: touch file (no content change), reconcile, verify mtime updated in DB and no re-reconcile on next cycle | reconcile.test.ts or update-handler.test.ts (new) |
| F6 | Folder hierarchy errors -> orphan nodes | High | Fault injection: make statSync throw for parent dir during handleCreate, verify child is not orphaned | reconcile.test.ts |
| F7 | One bad directory aborts remaining directories in sync loop | Critical | Error isolation: two dirs, first throws during reconcile, verify second still processes | sync.test.ts (new integration test) |
| F8 | reconcileIfChanged swallows errors then overwrites | High | Fault injection: external edit + reconcile error, verify file not overwritten with stale DB content | bidirectional-sync.slow.test.ts |
| F9 | Parse errors yield permanent stubs in pipeline | High | Corrupt file: write invalid markdown, run pipeline, verify stub is retryable (not permanent) | pipeline.test.ts |
| F10 | Parse errors at DEBUG only in deferred-parsing | Medium | Logging: trigger parse error in parseDeferredSequential, verify it's logged at WARN not DEBUG | deferred-parsing.test.ts (new) |

### Test Categories Needed

| Category | What It Tests | Catches | Exists? |
|---|---|---|---|
| Error isolation | Throw in listener, verify other listeners still run | F1 | YES (new) |
| Write-back verification | Edit in DB, verify .md file actually updated | F2, F3 | YES (new) |
| ID collision | Two nodes same ID, verify behavior is explicit | F4 | Partial (reconcile.test.ts has one) |
| Round-trip integrity | Edit -> write -> re-read, verify mtime/hash sync | F5 | NO |
| Fault injection | Corrupt/missing file mid-sync, verify graceful | F6, F7, F8 | NO |
| Pipeline error resilience | Parse error in pipeline, verify stub recovery | F9 | NO |
| Logging level audit | Verify errors logged at appropriate severity | F10 | NO |

## Implementation Plan

1. F5 (critical): Add test in update-handler — touch file, verify mtime updates even when hash matches
2. F7 (critical): Add integration test — multi-directory sync with one bad dir
3. F4, F6, F8, F9: Add fault-injection tests using existing test helpers
4. F10: Add logging-level assertion test