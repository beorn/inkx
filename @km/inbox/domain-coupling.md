---
mentions:
  - km
id: "@km/inbox/domain-coupling"
aliases:
  - km-domain-coupling
  - "@km/_orphan/domain-coupling"
created_at: 2026-01-25T12:55:30Z
closed_at: 2026-01-25T13:07:46Z
---

# [x] Investigate domain object coupling (Vault, SyncManager, Watcher) @km/_orphan #task #P3

Analyze coupling between domain objects and suggest improvements.

## Current State

- `createVault()` returns Vault domain object
- SyncManager takes `db: Database` directly (bypasses Vault)
- Watcher created via `vault.watch()` but also uses `getDb()` internally
- Tests use raw db functions like `getAllNodes(getDb())`

## Questions to Answer

1. Should SyncManager accept Vault instead of db?
2. What methods does SyncManager need that aren't on Vault?
3. Should Vault expose `db` for internal consumers? (`vault.database`?)
4. Pattern for `vault.db.updateNode()` vs `vault.updateNode()`?

## Goals

- Consistent DI pattern across all domain objects
- Ergonomic API for both production and test code
- Clear layering: CLI → Vault → internal (db, SyncManager, Watcher)

## Files to Review

- apps/@km/_orphan/cli/src/commands/sync.ts
- packages/@km/storage/src/sync-manager.ts
- packages/@km/storage/src/watcher.ts
- packages/@km/storage/src/vault.ts

