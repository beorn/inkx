---
id: "@km/domain/13-update-test-utilities-fakevault-repo-compatibility"
aliases:
  - km-domain.13
  - km-domain-13
  - "@km/domain/13"
created_at: 2026-01-26T08:28:49Z
closed_at: 2026-01-26T08:36:49Z
---

# [x] Update test utilities: FakeVault → Repo compatibility @km/domain #task #P2

Test files using FakeVault/ChaosFakeVault need updates:
- createFakeVault → createFakeRepo or add Repo interface
- Update 11 test files using legacy APIs
- Ensure TUI tests work with new API