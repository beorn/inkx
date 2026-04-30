---
id: "@km/inbox/remove-deprecated"
aliases:
  - km-remove-deprecated
  - "@km/_orphan/remove-deprecated"
created_at: 2026-01-23T18:27:33Z
closed_at: 2026-01-23T20:09:16Z
---

# [x] Remove deprecated singleton functions from km-storage @km/_orphan #task #P1

## Goal
Remove all deprecated singleton functions and migrate callers to domain object pattern.

## Deprecated Functions to Remove
1. **setKmDir() / getKmDir()** in emit.ts - 15+ production files, 9+ test files
2. **getDb() / setDb()** in db-instance.ts - 18+ production files, 11+ test files  
3. **needsRebuild()** in rebuild.ts - test only (already has vault.needsRebuild())

## Migration Strategy
- needsRebuild(): Just delete, tests use vault.needsRebuild()
- setKmDir/getKmDir: Keep runWithKmDir() for ALS context, remove public exports
- getDb/setDb: Keep internal, remove from public exports, callers use Vault

## Files to Update
- emit.ts: Remove setKmDir/getKmDir exports
- db-instance.ts: Remove getDb/setDb exports  
- db.ts: Update re-exports
- rebuild.ts: Remove needsRebuild()
- All test files using deprecated functions