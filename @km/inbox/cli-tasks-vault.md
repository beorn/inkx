---
id: "@km/inbox/cli-tasks-vault"
aliases:
  - km-cli-tasks-vault
  - "@km/_orphan/cli-tasks-vault"
created_at: 2026-01-25T08:27:53Z
closed_at: 2026-01-25T08:38:56Z
assignee: km
---

# [x] Convert CLI task commands to use Vault API @km/_orphan #chore #P1 @km

## Scope
Convert apps/@km/_orphan/cli/src/commands/tasks/* to use Vault domain object instead of singleton wrappers.

## Files to Convert (7 files)
- status.ts (2 uses: getTaskByIdPrefix)
- set-clear.ts (3 uses: getTaskByIdPrefix, emitNodeUpdated)
- list.ts (5 uses: queryTasks, getAncestors, getTasksFiltered)
- mutations.ts (5 uses: resolveTask, getTaskByIdPrefix)
- queries.ts (3 uses: getChildren, resolveNode)
- formatters.ts (2 uses: getChildren)

## Pattern
Before:
```typescript
import { getTaskByIdPrefix } from "@km/storage"
const task = getTaskByIdPrefix(id)
```

After:
```typescript
import { createVault, runGenerator, resolvePathArg } from "@km/storage"
const resolved = resolvePathArg(process.cwd(), getRootPath())
using vault = runGenerator(createVault(resolved.vaultRoot))
const task = vault.getTaskByIdPrefix(id)
```

## Success Criteria
- Zero singleton imports in tasks/* directory
- All commands create vault using pattern
- Commands still work (manual test: km task status <id>)