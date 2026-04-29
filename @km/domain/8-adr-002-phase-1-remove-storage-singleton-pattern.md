---
id: "@km/domain/8-adr-002-phase-1-remove-storage-singleton-pattern"
aliases:
  - km-domain.8
  - km-domain-8
  - "@km/domain/8"
created_at: 2026-01-26T07:57:42Z
closed_at: 2026-01-26T17:18:47Z
---

# [x] ADR-002 Phase 1: Remove storage singleton pattern @km/domain #task #P3 @7ca208ee

## Goal
Remove ALL storage singletons to complete ADR-002 domain object pattern.

## Root Cause (mdtest failure)
`createRepo` → `loadRepo` → `getDb()` returns singleton. When `repo.close()` closes the Database object, `dbInstance` variable is NOT set to null. Next command → `getDb()` returns closed database → crash.

## Singletons to Remove

### Database (db-instance.ts)
- `dbInstance` - global db connection
- `getDb()` - returns singleton
- `setDb()` - injects external db
- `closeDb()` - closes singleton

### Paths (emit.ts)
- `defaultKmDir` - global .km path
- `getKmDir()` - returns path singleton
- `setKmDir()` - sets path singleton

### Events (emit.ts)
- `eventHub` - broadcast events
- `fsSync` - sync to filesystem
- `setEventHub()` / `setFsSync()` - wire up callbacks

## Implementation Phases

### Phase 1: Database DI (fixes mdtest)
1. Add `database?: Database` to LoadOptions in repo-loader.ts
2. Update loadRepo to create own db instead of getDb() when no DI
3. Update sh.ts to use `repo.database` instead of `getDb()`
4. Update helper functions (lines 648, 901, 1084) to accept db param

### Phase 2: Path DI
1. Add `kmDir` property to Repo interface
2. Update emit.ts functions to accept kmDir param
3. Update callers to pass kmDir from Repo

### Phase 3: Event DI
1. Add onEvent/onFsSync hooks to RepoHooks
2. Update emit() to use hooks instead of global callbacks
3. Update daemon.ts and tui.ts to pass callbacks via RepoHooks

## Files to Modify
- packages/@km/storage/src/repo-loader.ts
- packages/@km/storage/src/repo.ts
- packages/@km/storage/src/emit.ts
- apps/@km/_orphan/cli/src/commands/sh.ts
- apps/@km/_orphan/cli/src/commands/daemon.ts
- apps/@km/tui/src/tui.ts

## Verification
```bash
bun run test:mdtest -- apps/km-cli/tests/sh/history.test.md
bun run test:all
```

## Notes
- Keep exports for tests using AsyncLocalStorage context (runWithDb, runWithKmDir)
- Deprecation warnings already in place