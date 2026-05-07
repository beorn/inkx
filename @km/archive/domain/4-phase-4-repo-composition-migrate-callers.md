---
mentions:
  - km
  - km
id: "@km/domain/4-phase-4-repo-composition-migrate-callers"
aliases:
  - km-domain.4
  - km-domain-4
  - "@km/domain/4"
created_at: 2026-01-25T23:36:36Z
closed_at: 2026-01-26T08:13:05Z
assignee: km
---

# [x] Phase 4: Repo composition + migrate callers @km/domain #task #P2 @km

Create Repo composition:

- Repo interface: DataStore + optional FileTree + ConfigStore + sync
- Factories: createRepo (files + data), createBareRepo (data only), createTestRepo (Map DataStore, fastest)
- Migrate createVault() callers to use new Repo
- Delete old store.ts (replaced by DataStore)

