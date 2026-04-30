---
id: "@km/inbox/deprecations"
aliases:
  - km-deprecations
  - "@km/_orphan/deprecations"
created_at: 2026-02-03T11:12:00Z
closed_at: 2026-02-04T11:23:56Z
---

# [x] Remove deprecated/legacy code (non-inkx) @km/_orphan #epic #P2

Tracking epic for removing deprecated and legacy code outside of inkx. inkx API migration tracked by @km/_orphan/silvery-legacy-loop.

## chalkx (vendor/beorn-chalkx)

| Remove | Replacement | Location |
|--------|-------------|----------|
| default export chalkX | import { createTerm } | index.ts:155 |
| export { chalk } | term.red() etc | index.ts:174 |
| supportsExtendedUnderline() | detectExtendedUnderline() | detection.ts:272 |
| setExtendedUnderlineSupport() | createTerm({ extendedUnderline }) | detection.ts:284 |
| Global detection state | Per-term instance detection | detection.ts:292 |

## km packages

### @km/storage/emit.ts — 14 deprecated functions
emit, emitNode*, emitTask*, emitSession*, setKmDir, getKmDir.
Replacement: Emitter domain object. (See @km/rev-arch-0130/7-delete-deprecated-functions-in-emit-ts)

### @km/storage/db-instance.ts — deprecated module
getDb, setDb, runWithDbContext, getContextDb etc.
Replacement: createVault() factory. (See @km/rev-arch-0130/6-delete-deprecated-functions-in-db-instance-ts)

### @km/storage/rebuild.ts — deprecated module
Replacement: createRepo(). (See @km/rev-arch-0130/8-delete-deprecated-modules-rebuild-ts-loadrepo)

### @km/storage/config.ts — 4 deprecated functions
getOriginalBeadsConfigPath, getConfigPath, getBeadsConfig, getTuiConfig.
Replacement: loadConfigObject(). (See @km/rev-arch-0130/9-delete-deprecated-config-functions)

### @km/storage/repo-loader.ts — deprecated loadRepo()
Replacement: createRepo(). (See @km/rev-arch-0130/8-delete-deprecated-modules-rebuild-ts-loadrepo)

### @km/storage/testing — 2 deprecated aliases
createMockWatcher, MockWatcher → createFakeWatcher, FakeWatcher. (See @km/rev-arch-0130/10-delete-deprecated-testing-aliases)

### Singleton removal prerequisite
@km/rev-arch-0130/0-remove-db-instance-ts-singleton-breaks-test-isolat (db-instance singleton) and @km/rev-arch-0130/1-remove-emit-ts-singletons-eventhub-fssync (emit.ts singletons) must be done before their respective deprecated function removal.

## Approach
Per docs/lessons/refactoring.md: Break intentionally → let tsc guide fixes.
Phase order: Absorb → Purge → Remove → Fix.

## Related sub-beads
- @km/rev-arch-0130/6-delete-deprecated-functions-in-db-instance-ts through .10 — individual km deprecated function removal
- @km/rev-arch-0130/0-remove-db-instance-ts-singleton-breaks-test-isolat, .1 — singleton removal prerequisites