---
id: "@km/_orphan/vault-pure-di"
aliases:
  - km-vault-pure-di
created_at: 2026-01-25T12:47:21Z
closed_at: 2026-01-25T13:06:53Z
assignee: 4f15ead4-7d35-4730-bfaa-6e6c222d57fa
---

# [x] Make createVault() stop using getDb() singleton @km/_orphan #task #P2 @4f15ead4-7d35-4730-bfaa-6e6c222d57fa

Thread db parameter through 5 internal functions in vault-loader.ts so createVault() uses pure DI instead of global singleton.

Functions to update:
- resolveLinks(db, ...)
- resolveLinksAsync(db, ...)
- buildFileIndex(db)
- applyParseResults(db, ...)
- parseDeferredSequential(db, ...)

Also update:
- vault.ts to use result.database
- watcher.ts to accept db via options
- rebuild.ts to accept db as parameter