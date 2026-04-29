---
id: "@km/_orphan/storage-2"
aliases:
  - km-storage-2
created_at: 2026-01-27T01:53:36Z
closed_at: 2026-01-27T15:33:30Z
---

# [x] Remove all remaining singletons from km-storage @km/_orphan #task #P1 @beorn

## Goal
Remove all singletons from @km/storage unless explicitly cleared by user.

## Current State (after createDbOps refactoring)
- ✅ createDbOps(db, emitter?) - singleton-free
- ✅ createDBDataStore(db, { emitter }) - singleton-free  
- ✅ createRepo() / Repo - singleton-free
- ⚠️ Legacy db-ops functions - use global emit() for disk mode
- ⚠️ DiskStore class - uses setDb() singleton
- ⚠️ testing/env.ts TestRepo - uses legacy functions + ALS wrappers

## Remaining Work
1. Remove legacy db-ops functions (or convert to thin wrappers)
2. Migrate TestRepo to use new API
3. Remove or deprecate DiskStore class
4. Remove ALS wrappers (runWithKmDir, runWithDb)
5. Remove emit.ts singleton functions (getKmDir, setKmDir, emit)
6. Remove db-instance.ts singleton functions (getDb, setDb)

## Acceptance Criteria
- No singletons remain unless officially cleared by user
- All tests pass
- Layering preserved (db-ops < DataStore < Repo)
