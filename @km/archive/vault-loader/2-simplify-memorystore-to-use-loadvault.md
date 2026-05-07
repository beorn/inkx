---
mentions:
  - km
id: "@km/vault-loader/2-simplify-memorystore-to-use-loadvault"
aliases:
  - km-vault-loader.2
  - km-vault-loader-2
  - "@km/vault-loader/2"
created_at: 2026-01-23T09:40:05Z
closed_at: 2026-01-23T10:55:35Z
---

# [x] Simplify MemoryStore to use loadVault() @km/vault-loader #task #P2

Remove duplicate loading code from MemoryStore:

- Remove scanFilesGenerator(), resolveLinksGenerator()
- initialize() → yield* loadVault(this.rootPath)
- Keep mutation methods (updateNode, etc.)

