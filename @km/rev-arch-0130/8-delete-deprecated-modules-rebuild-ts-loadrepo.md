---
id: "@km/rev-arch-0130/8-delete-deprecated-modules-rebuild-ts-loadrepo"
aliases:
  - km-rev-arch-0130.8
  - km-rev-arch-0130-8
  - "@km/rev-arch-0130/8"
created_at: 2026-01-30T00:35:40Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Delete deprecated modules (rebuild.ts, loadRepo) @km/rev-arch-0130 #task #P2

Delete deprecated modules: rebuild.ts (line 4) and repo-loader.ts (loadRepo at line 131).

## Execution

Phase order: Remove → Fix

1. **Remove**: Delete rebuild.ts entirely, delete loadRepo() from repo-loader.ts
2. **Fix**: Let `tsc` guide fixes — migrate to createRepo()

```bash
# Verify current usage count
grep -rn "loadRepo\|rebuild" packages/km-storage/src/ --include="*.ts" -l

# After deletion
bunx tsc --noEmit 2>&1 | head -50
```

## Definition of Done
- [ ] rebuild.ts deleted entirely
- [ ] loadRepo() deleted from repo-loader.ts
- [ ] All callers migrated to createRepo()
- [ ] `tsc` passes
- [ ] `grep -r "loadRepo\b" packages/` finds nothing (except createRepo internals)