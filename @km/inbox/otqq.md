---
mentions:
  - km
  - beorn
id: "@km/inbox/otqq"
aliases:
  - km-otqq
  - "@km/_orphan/otqq"
created_at: 2026-01-26T07:57:04Z
closed_at: 2026-01-26T08:05:50Z
assignee: beorn
---

# [x] ADR-002 Phase 6: Make createRepo a generator like createVault @km/_orphan #task #P1 @beorn

## Problem

createVault is a generator function that yields progress.
createRepo is a regular function.

This signature mismatch blocks the Vault→Repo terminology migration.

## Solution

Make createRepo also yield progress, matching createVault's signature:

```typescript
export function* createRepo(
  rootPath?: string,
  options?: CreateRepoOptions,
): Generator<StepYield, Repo, unknown>
```

## Benefits

- Same calling convention as createVault
- Enables batch rename: createVault → createRepo
- Progress feedback for large vaults
- Consistent API

## Steps

1. Update createRepo to be a generator
2. Add yield points for: directory scan, database init, file tree init
3. Update createBareRepo similarly (or keep as regular function)
4. Update consumers of createRepo to use runGenerator()
5. Add type alias: export const createVault = createRepo
6. Batch rename across codebase

## Related

- ADR-002 Phase 6
- @km/_orphan/jz5c (terminology migration)

