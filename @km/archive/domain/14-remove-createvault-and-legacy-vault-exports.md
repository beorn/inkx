---
mentions:
  - km
id: "@km/domain/14-remove-createvault-and-legacy-vault-exports"
aliases:
  - km-domain.14
  - km-domain-14
  - "@km/domain/14"
created_at: 2026-01-26T08:28:50Z
closed_at: 2026-01-26T09:39:02Z
---

# [x] Remove createVault and legacy Vault exports @km/domain #task #P3

Final cleanup after all migrations complete:

- Remove createVault from index.ts exports
- Remove vault.ts file
- Remove vault-loader.ts (or refactor to repo-loader.ts)
- Update all imports across codebase

