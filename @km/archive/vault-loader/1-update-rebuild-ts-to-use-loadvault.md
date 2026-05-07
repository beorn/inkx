---
mentions:
  - km
id: "@km/vault-loader/1-update-rebuild-ts-to-use-loadvault"
aliases:
  - km-vault-loader.1
  - km-vault-loader-1
  - "@km/vault-loader/1"
created_at: 2026-01-23T09:40:00Z
closed_at: 2026-01-23T10:55:33Z
---

# [x] Update rebuild.ts to use loadVault() @km/vault-loader #task #P2

Make existing functions thin wrappers around loadVault():

- ensureState() → yield* loadVault(root, { searchAncestors })
- rebuildState() → yield* loadVault(root, { force: true })
- syncState() → yield* loadVault(root)
- Keep readEvents(), needsRebuild() as internal helpers

