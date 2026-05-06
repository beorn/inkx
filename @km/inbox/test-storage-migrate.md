---
mentions:
  - km
  - 95b4fc6d
id: "@km/inbox/test-storage-migrate"
aliases:
  - km-test-storage-migrate
  - "@km/_orphan/test-storage-migrate"
created_at: 2026-01-23T13:18:27Z
closed_at: 2026-01-23T22:20:49Z
assignee: 95b4fc6d
---

# [x] Migrate storage tests from singletons to domain objects @km/_orphan #task #P3 @95b4fc6d

## Storage Test Migration

Convert storage layer tests from singleton pattern to domain objects, enabling parallel execution.

## Scope (from @km/domain-objects/t analysis)

### Phase 1: High-ROI files ✅ COMPLETE

- [x] `node-crud.test.ts` - isolated directories
- [x] `links.test.ts` - isolated directories
- [x] `query.test.ts` - uses in-memory DB (naturally isolated)
- [x] `config.test.ts` - isolated directories
- [x] `store.test.ts` - isolated directories

### Phase 2: Storage layer ✅ COMPLETE

- [x] `rebuild.test.ts` - isolated directories
- [x] `db-rules.test.ts` - isolated directories
- [x] `resolve.test.ts` - isolated directories

### Phase 3: Integration ✅ PARTIAL

- [ ] `watch/*.test.ts` → createWatcher
- [x] `sync/chaos/*.test.ts` → **Now uses AsyncLocalStorage for parallel isolation**
- [ ] `bidirectional-sync.test.ts` → createVault

## Current Status

**Phase 3 progress:** Chaos fuzzer now uses AsyncLocalStorage + in-memory databases 
for test isolation, enabling parallel execution (500 tests in 3.4s).

Key changes (2026-01-23):

- Added `runWithDb(db, fn)` to db-instance.ts using AsyncLocalStorage
- Fuzzer creates isolated in-memory DB per test
- `getDb()` checks async context first, falls back to singleton
- Default timeout increased from 10ms to 100ms
- Sync handlers made awaitable (no more fire-and-forget)

Note: True removal of singletons requires refactoring the internal storage layer 
to pass Database through the call stack (@km/domain-objects/6-remove-old-singleton-apis).

## Success Criteria

- [x] Use isolated temp directories
- [x] Parallel execution working for chaos tests
- [ ] Remove `describe.serial` from migrated tests (blocked by singletons)
- [ ] No singleton usage (getDb, closeDb, setKmDir) - requires internal refactor

## Reference

See `docs/dev/test-reorganization-analysis.md` for full analysis and patterns.

