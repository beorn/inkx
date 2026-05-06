---
mentions:
  - km
id: "@km/rev-code-0127/0-complete-singleton-migration-db-instance-emit"
aliases:
  - km-rev-code-0127.0
  - km-rev-code-0127-0
  - "@km/rev-code-0127/0"
created_at: 2026-01-27T14:28:34Z
closed_at: 2026-01-27T14:38:58Z
---

# [x] Complete singleton migration (db-instance, emit) @km/rev-code-0127 #bug #P1

**Critical**: Remove module-level singletons from db-instance.ts and emit.ts

Files:

- packages/@km/storage/src/db-instance.ts (5 deprecated exports)
- packages/@km/storage/src/emit.ts (13 deprecated exports)

Actions:

1. Quarantine deprecated exports (move to internal/ or delete)
2. Migrate remaining callers to Repo/Emitter domain objects
3. Verify test isolation works correctly

Impact: Breaks test isolation, prevents parallel testing, hidden dependencies

