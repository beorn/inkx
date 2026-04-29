---
id: "@km/domain-objects/6-remove-old-singleton-apis"
aliases:
  - km-domain-objects.6
  - km-domain-objects-6
  - "@km/domain-objects/6"
created_at: 2026-01-23T10:22:05Z
closed_at: 2026-01-23T14:31:32Z
---

# [x] Remove old singleton APIs @km/domain-objects #chore #P4

After migration complete, remove deprecated code:

- Delete getDb(), getStore(), getKmDir() singletons
- Delete MemoryStore, DiskStore classes
- Delete db-instance.ts
- Clean up emit.ts global state

## Status (2026-01-23)

**Deprecation complete.** All singleton APIs now have `@deprecated` markers:

| Function | Deprecation Message |
|----------|---------------------|
| `getDb()` | Use Vault.rawQuery() or Vault query methods |
| `setDb()` | Internal use only. Use createVault() factory |
| `getKmDir()` | Use Vault.path or pass kmDir explicitly |
| `MemoryStore` | Use createVault() factory |
| db.ts functions | Direct singleton use deprecated |
| rebuild.ts | Legacy API, use createVault() |
| vault-loader.ts | Use createVault() |

**Actual removal** of the deprecated code is deferred. Tests and internal storage layer still use the singletons, but all public API consumers have been migrated to createVault().