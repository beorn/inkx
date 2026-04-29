---
id: "@km/_orphan/rm-singletons"
aliases:
  - km-rm-singletons
created_at: 2026-01-23T17:59:24Z
closed_at: 2026-01-23T18:07:52Z
---

# [x] Remove singletons from km-storage, use domain objects @km/_orphan #task #P2

## Goal
Move from singleton-based APIs (setKmDir, getDb) to domain object pattern (vault.needsRebuild()).

## Tasks
- [ ] Fix withTestEnv - remove .km creation in parent dir
- [ ] Add needsRebuild() method to Vault interface
- [ ] Update rebuild.test.ts to use vault.needsRebuild()
- [ ] Deprecate standalone needsRebuild() function

## Root Causes Fixed
1. withTestEnv creates .km in parent of vaultDir, causing searchAncestors to find it
2. needsRebuild() checks physical files but tests use in-memory db