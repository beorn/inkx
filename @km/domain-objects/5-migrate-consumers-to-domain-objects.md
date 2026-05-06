---
mentions:
  - km
id: "@km/domain-objects/5-migrate-consumers-to-domain-objects"
aliases:
  - km-domain-objects.5
  - km-domain-objects-5
  - "@km/domain-objects/5"
created_at: 2026-01-23T10:22:04Z
closed_at: 2026-01-23T14:15:38Z
---

# [x] Migrate consumers to domain objects @km/domain-objects #task #P3

Update all CLI commands and TUI to use new domain objects.

- Replace loadVault() + getNode() with createVault()
- Replace initStore() with createVault()
- Use disposable patterns throughout

