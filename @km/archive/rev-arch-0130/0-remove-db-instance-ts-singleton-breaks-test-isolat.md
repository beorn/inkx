---
mentions:
  - km
id: "@km/rev-arch-0130/0-remove-db-instance-ts-singleton-breaks-test-isolat"
aliases:
  - km-rev-arch-0130.0
  - km-rev-arch-0130-0
  - "@km/rev-arch-0130/0"
created_at: 2026-01-30T00:35:27Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Remove db-instance.ts singleton (breaks test isolation) @km/rev-arch-0130 #bug #P2

Critical: `let dbInstance` at module scope in packages/@km/storage/src/internal/db-instance.ts:33 breaks test isolation. Migrate all usages to Repo domain object.

