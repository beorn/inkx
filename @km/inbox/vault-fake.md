---
mentions:
  - km
id: "@km/inbox/vault-fake"
aliases:
  - km-vault-fake
  - "@km/_orphan/vault-fake"
created_at: 2026-01-23T10:56:42Z
closed_at: 2026-01-23T11:28:50Z
---

# [x] FakeVault test double (no SQLite, canned data) @km/_orphan #task #P2

Vault interface impl with canned data for unit tests that don't need real parsing.

loadVault() already supports :memory: SQLite - this is for even simpler test doubles.

Depends on: @km/domain-objects/2-implement-createvault-factory (createVault)

