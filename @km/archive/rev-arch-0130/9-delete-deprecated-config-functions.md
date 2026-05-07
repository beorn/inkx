---
mentions:
  - km
id: "@km/rev-arch-0130/9-delete-deprecated-config-functions"
aliases:
  - km-rev-arch-0130.9
  - km-rev-arch-0130-9
  - "@km/rev-arch-0130/9"
created_at: 2026-01-30T00:35:41Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Delete deprecated config functions @km/rev-arch-0130 #task #P2

Delete 4 deprecated config functions: getOriginalBeadsConfigPath, getConfigPath, getBeadsConfig, getTuiConfig.

## Execution

Phase order: Purge → Remove → Fix

1. **Purge**: Delete all 4 deprecated functions from config.ts
2. **Remove**: Remove exports from package index
3. **Fix**: Let `tsc` guide fixes — migrate to loadConfigObject()

```bash
# Verify current usage count
grep -rn "getOriginalBeadsConfigPath\|getConfigPath\|getBeadsConfig\|getTuiConfig" packages/ --include="*.ts" -l

# After deletion
bunx tsc --noEmit 2>&1 | head -50
```

## Definition of Done

- [ ] All 4 deprecated functions deleted
- [ ] No backwards compat shims
- [ ] All callers migrated to loadConfigObject()
- [ ] `tsc` passes
- [ ] `grep -r "getOriginalBeadsConfigPath\|getConfigPath\|getBeadsConfig\|getTuiConfig" packages/` finds nothing

