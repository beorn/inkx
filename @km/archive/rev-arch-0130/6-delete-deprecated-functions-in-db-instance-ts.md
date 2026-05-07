---
mentions:
  - km
id: "@km/rev-arch-0130/6-delete-deprecated-functions-in-db-instance-ts"
aliases:
  - km-rev-arch-0130.6
  - km-rev-arch-0130-6
  - "@km/rev-arch-0130/6"
created_at: 2026-01-30T00:35:40Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Delete deprecated functions in db-instance.ts @km/rev-arch-0130 #task #P2

Delete 6 deprecated functions in db-instance.ts: getDb, setDb, runWithDbContext, getContextDb, etc.

## Prerequisites

- @km/rev-arch-0130/0-remove-db-instance-ts-singleton-breaks-test-isolat (singleton removal) must be done first

## Execution

Phase order: Purge → Remove → Fix

1. **Purge**: Delete all @deprecated functions from db-instance.ts
2. **Remove**: Remove exports from package index
3. **Fix**: Let `tsc` guide fixes to all callers — migrate to createVault() factory

```bash
# Verify current usage count
grep -r "getDb\|setDb\|runWithDbContext\|getContextDb" packages/km-storage/src/ --include="*.ts" -l

# After deletion, fix tsc errors
bunx tsc --noEmit 2>&1 | head -50
```

## Definition of Done

- [ ] All deprecated functions deleted (not commented, not @deprecated — deleted)
- [ ] No backwards compat shims or re-exports
- [ ] All callers migrated to createVault() factory
- [ ] `tsc` passes
- [ ] `grep -r "getDb\|setDb\|runWithDbContext\|getContextDb" packages/` finds nothing (except createVault internals)

