---
mentions:
  - km
id: "@km/rev-arch-0130/10-delete-deprecated-testing-aliases"
aliases:
  - km-rev-arch-0130.10
  - km-rev-arch-0130-10
  - "@km/rev-arch-0130/10"
created_at: 2026-01-30T00:35:41Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Delete deprecated testing aliases @km/rev-arch-0130 #task #P2

Delete deprecated testing aliases: createMockWatcher and MockWatcher (testing/index.ts:62-65).

## Execution

Phase order: Remove → Fix

1. **Remove**: Delete aliases from testing/index.ts
2. **Fix**: Let `tsc` guide fixes — rename to createFakeWatcher/FakeWatcher

```bash
# Verify current usage count
grep -rn "createMockWatcher\|MockWatcher" packages/ --include="*.ts" -l

# Simple rename via batch refactor
bun vendor/beorn-tools/tools/refactor.ts rename.batch --pattern "createMockWatcher" --replace "createFakeWatcher"
bun vendor/beorn-tools/tools/refactor.ts rename.batch --pattern "MockWatcher" --replace "FakeWatcher"

# After deletion
bunx tsc --noEmit 2>&1 | head -50
```

## Definition of Done

- [ ] Aliases deleted from testing/index.ts
- [ ] All callers use createFakeWatcher/FakeWatcher
- [ ] `tsc` passes
- [ ] `grep -r "createMockWatcher\|MockWatcher" packages/` finds nothing

