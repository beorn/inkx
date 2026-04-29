---
id: "@km/_orphan/vault-reexport"
aliases:
  - km-vault-reexport
created_at: 2026-01-24T08:29:32Z
closed_at: 2026-01-24T15:47:13Z
---

# [x] Re-export Vault type from vault-context.tsx @km/_orphan #task #P3

Components should import { Vault, useVault } from vault-context instead of depending on @km/storage directly. Also prefer type inference over explicit Vault annotations where possible.