---
mentions:
  - km
id: "@km/rev-arch-0130"
aliases:
  - km-rev-arch-0130
  - "@km/_orphan/rev-arch-0130"
created_at: 2026-01-30T00:35:18Z
closed_at: 2026-02-04T11:57:38Z
---

# [x] Code review: Architecture and quality (Jan 2026) @km/rev-arch-0130 #epic #P2

## Code Review: Architecture and Quality

**Date**: 2026-01-30
**Focus**: Full codebase review (layers, tests, org, specs, beads)

## Summary

**4 Critical**, **8 High**, **15 Medium**, **12 Low**

**Knip**: 24 unused files, 67 unused exports, 110 unused types, 21 unused devDeps, 7 duplicate exports

---

## Critical (Blocks Correctness)

- [db-instance.ts:33](packages/@km/storage/src/internal/db-instance.ts#L33) - **Singleton**: `let dbInstance: Database | null = null` at module scope (breaks test isolation)
- [emit.ts:27](packages/@km/storage/src/internal/emit.ts#L27) - **Singleton**: `let eventHub` and `let fsSync` (hidden global dependencies)
- [@km/beads/sync.ts:7-8](packages/@km/beads/src/sync.ts#L7) - **Layer violation**: @km/beads directly imports `node:fs` - App layer touching Filesystem directly
- [bd.ts:94](apps/@km/_orphan/cli/src/commands/bd.ts#L94) - **Missing Repo DI**: `queryReady()` called without passing `{ repo }` parameter

---

## High (Architecture Violations)

- Classes extending EventEmitter (acceptable): WorkerWatcher, FileSystemWatcher, WriteQueue, SyncManager, KmDaemon
- [caldav-client.ts:23](packages/@km/_orphan/connector-caldav/src/caldav-client.ts#L23) - **Class**: `CalDAVClient` - should be factory
- [carddav-client.ts:15](packages/@km/_orphan/connector-caldav/src/carddav-client.ts#L15) - **Class**: `CardDAVClient` - should be factory
- 5 TUI files with `let _term: ... | null = null` module-level state pattern

---

## Medium (Tech Debt)

- db-instance.ts: 6 @deprecated functions
- emit.ts: 14 @deprecated functions
- rebuild.ts, config.ts, repo-loader.ts: deprecated modules
- 24 unused files (knip)
- Doc drift: commands.md vs implementation
- Duplicate beads: inkx-flexx vs inkx-flexx-default

---

## Quick Wins

1. Consolidate duplicate beads
2. Delete deprecated aliases (createMockWatcher, MockWatcher)
3. Standardize test naming (.spec.ts → .test.ts)
4. Fix knip config

---

## Larger Refactors

1. Remove singleton modules (db-instance.ts, emit.ts) ~500 lines
2. Fix @km/beads layer violation (sync.ts, migrate.ts) 2 files
3. Convert DAV clients to factories ~200 lines
4. Unify term initialization pattern (5 TUI files)

