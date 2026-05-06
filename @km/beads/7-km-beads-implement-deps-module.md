---
mentions:
  - km
id: "@km/beads/7-km-beads-implement-deps-module"
aliases:
  - km-beads.7
  - km-beads-7
  - "@km/beads/7"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:22Z
---

# [x] km-beads: Implement deps module @km/beads #task #P2

Create packages/@km/beads/src/deps.ts with:

- addDependency(id, dependsOn) - Add blocked-by:: property
- removeDependency(id, dependsOn) - Remove from blocked-by:: property
- listDependencies(id) - List all blockers and blocked-by

Depends on: @km/props for inline property manipulation

Create tests in packages/@km/beads/tests/deps.test.ts

