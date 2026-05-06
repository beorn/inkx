---
mentions:
  - km
id: "@km/beads/8-km-beads-implement-migrate-module"
aliases:
  - km-beads.8
  - km-beads-8
  - "@km/beads/8"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:39Z
---

# [x] km-beads: Implement migrate module @km/beads #task #P3

Create packages/@km/beads/src/migrate.ts with:

- migrateFromBeads(beadsDir) - Import from .beads/ directory
- Maps: status → task_status, priority → #P tag, type → #bug/#feature tag
- Converts dependencies to blocked-by:: properties
- Stores original beads ID in data.beads_id
- Backs up .beads/ to .beads.bak/

Create tests in packages/@km/beads/tests/migrate.test.ts

