---
mentions:
  - km
  - "67570949"
id: "@km/inbox/ylxe"
aliases:
  - km-ylxe
  - "@km/_orphan/ylxe"
created_at: 2026-01-26T18:06:56Z
closed_at: 2026-01-27T01:09:30Z
assignee: "67570949"
---

# [x] Remove AsyncLocalStorage and singleton patterns - use DI consistently @km/_orphan #task #P2 @67570949

## Goal

Remove all uses of AsyncLocalStorage (runWithDb, runWithKmDir) and getDb() singleton pattern. 
Use proper dependency injection where the database/config is passed explicitly through the call stack.

## Context

@km/domain/9-add-file-loading-capability-to-createrepo/10 created RuleContext and Emitter domain objects, but tests still rely on:

- `getDb()` with AsyncLocalStorage context lookup
- `runWithDb(db, fn)` for test isolation
- `runWithKmDir(kmDir, fn)` for path context

These patterns work but are "smelly" - they hide dependencies and make the code harder to reason about.

## Scope

1. Review object composition - ensure Repo owns db, emitter, config properly
2. Update all functions to receive db/emitter explicitly (DI pattern)
3. Update tests to use explicit db parameter instead of getDb()
4. Remove AsyncLocalStorage usage once all callers are updated
5. Remove deprecated exports: getDb, runWithDb, runWithKmDir, getKmDir, setKmDir

## Principle

**WRONG**: Use AsyncLocalStorage to magically provide context
**RIGHT**: Pass db/emitter/config as explicit parameters (dependency injection)

