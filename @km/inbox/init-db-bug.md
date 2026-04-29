---
id: "@km/_orphan/init-db-bug"
aliases:
  - km-init-db-bug
created_at: 2026-01-25T12:23:14Z
closed_at: 2026-01-25T12:51:19Z
assignee: 3f5ed42b
---

# [x] Fix km init database error - db.query is undefined @km/_orphan #bug #P1 @3f5ed42b

## Bug

`km init .` fails with TypeError during sync:

```
TypeError: undefined is not an object (evaluating 'db.query')
  at getNodesUnderPath (/packages/km-storage/src/db-queries/core-lookup.ts:125:16)
  at reconcileDirectory (/packages/km-storage/src/watch/reconcile.ts:72:19)
```

## Reproduction

```bash
cd /tmp/test-vault
bun run /path/to/km/apps/km-cli/src/index.ts init .
```

Creates .km directory and files, but sync fails with db error.

## Impact

- Blocks mdtest plugin testing (can't initialize test vaults)
- Blocks km.test.md migration
- Affects all users trying to initialize new vaults

## Root Cause

Likely related to domain object refactoring - db parameter not being passed correctly to getNodesUnderPath.

## Next Steps

1. Reproduce in minimal test case
2. Check recent commits for db parameter changes
3. Fix parameter passing in reconcileDirectory
4. Add test to prevent regression