---
id: "@km/inbox/vault-plugins"
aliases:
  - km-vault-plugins
  - "@km/_orphan/vault-plugins"
created_at: 2026-01-23T10:56:53Z
closed_at: 2026-01-23T12:45:25Z
---

# [x] Vault lifecycle hooks (beforeMutation, afterQuery) @km/_orphan #feature #P2

Plugin hooks for extending Vault behavior:
- beforeMutation: validate or transform mutations
- afterQuery: augment query results
- onSync: hook into file system sync

Depends on: @km/domain-objects/2-implement-createvault-factory (createVault)