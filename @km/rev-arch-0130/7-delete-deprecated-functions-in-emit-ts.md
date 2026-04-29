---
id: "@km/rev-arch-0130/7-delete-deprecated-functions-in-emit-ts"
aliases:
  - km-rev-arch-0130.7
  - km-rev-arch-0130-7
  - "@km/rev-arch-0130/7"
created_at: 2026-01-30T00:35:40Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Delete deprecated functions in emit.ts @km/rev-arch-0130 #task #P2

Delete 14 deprecated functions in emit.ts: emit, emitNode*, emitTask*, emitSession*, setKmDir, getKmDir.

## Prerequisites
- @km/rev-arch-0130/1-remove-emit-ts-singletons-eventhub-fssync (singleton removal) must be done first

## Execution

Phase order: Purge → Remove → Fix

1. **Purge**: Delete all @deprecated functions from emit.ts
2. **Remove**: Remove exports from package index
3. **Fix**: Let `tsc` guide fixes — migrate to Emitter domain object

```bash
# Verify current usage count
grep -rn "emitNode\|emitTask\|emitSession\|setKmDir\|getKmDir" packages/ --include="*.ts" -l

# After deletion, fix tsc errors
bunx tsc --noEmit 2>&1 | head -50
```

## Definition of Done
- [ ] All 14 deprecated functions deleted
- [ ] No backwards compat shims or re-exports
- [ ] All callers migrated to Emitter domain object
- [ ] `tsc` passes
- [ ] `grep -r "emitNode\|emitTask\|emitSession\|setKmDir\|getKmDir" packages/` finds nothing