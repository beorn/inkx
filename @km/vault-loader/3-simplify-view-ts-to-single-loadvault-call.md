---
id: "@km/vault-loader/3-simplify-view-ts-to-single-loadvault-call"
aliases:
  - km-vault-loader.3
  - km-vault-loader-3
  - "@km/vault-loader/3"
created_at: 2026-01-23T09:40:07Z
closed_at: 2026-01-23T10:55:36Z
---

# [x] Simplify view.ts to single loadVault() call @km/vault-loader #task #P2

Replace mode branching with unified call:

Before: 40+ lines of if/else for memory vs disk mode
After: yield* storageModule.loadVault(vaultRoot)