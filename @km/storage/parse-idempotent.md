---
id: "@km/storage/parse-idempotent"
aliases:
  - km-storage.parse-idempotent
  - km-storage-parse-idempotent
created_by: claude:d29abbfa
created_at: 2026-03-18T22:15:54Z
closed_at: 2026-03-19T17:31:13Z
close_reason: "Fixed: added parsed flag to nodes table, guards in all 3 parse
  entry points (parseStubFile, parseOneFile, insertFileNodes). Schema migration.
  Test: parse-idempotent.test.ts (6 tests), all 1009 storage tests pass."
---

# [x] Storage: make deferred parsing idempotent — prevent double-parse and data loss @km/storage #task #P2 @claude:21c57d63

## Problem

The storage layer has 3 parse entry points (parseStubFile, parseOneFile, insertFileNodes/pipeline) with no coordination. A file can be parsed multiple times, producing duplicate children with fresh ULIDs. The current fix (skip if has children) is a band-aid.

## Root Cause (5-why)

1. File parsed twice (eager + deferred)
2. No coordination between parse paths
3. Children get fresh ULIDs per parse (INSERT OR IGNORE can't dedup)
4. Parser is stateless, no deterministic IDs
5. Pipeline grew incrementally without shared parse state

## Proposed Fix

1. **Add `parsed` flag to nodes table** — set after first successful parse, checked before re-parsing
2. **Prune deferredFiles list** — after parseStubFile, remove the file from the deferred list
3. **Deterministic child IDs** — derive child IDs from parent ID + content hash or parent_idx, so duplicate parses produce the same IDs (UPSERT instead of INSERT)
4. **Integration test** — test the full flow: events.jsonl load + eager parse + deferred parse, verify no duplicates and no data loss
5. **Assert in CI** — add a constraint or post-load check that no parent has duplicate parent_idx values

## Immediate mitigations (already applied)

- Skip re-parsing files that already have children (6c40d950)
- Asana vault acceptance tests (asana-vault.slow.spec.ts)