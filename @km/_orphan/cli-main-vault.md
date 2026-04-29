---
id: "@km/_orphan/cli-main-vault"
aliases:
  - km-cli-main-vault
created_at: 2026-01-25T08:30:34Z
closed_at: 2026-01-25T08:44:13Z
---

# [x] Convert main CLI commands to use Vault API @km/_orphan #task #P1 @km

Convert main CLI commands (non-tasks) to use Vault domain object instead of singleton wrappers.

Files to Convert (7 files with high singleton usage):
- sh.ts (9 uses: getNode, getChildren, getAllNodes, search, etc.)
- inbox.ts (6 uses: getNodesUnderPath, resolveNode, emitNodeCreated, etc.)
- move.ts (4 uses: getNode, resolveNode, emitNodeMoved)
- list.ts (4 uses: getNodesUnderPath, getFilteredNodes)
- status.ts (3 uses: getNode, getChildren, getAllNodes)
- agent.ts (3 uses: queryNodes, resolveNode, emitNodeUpdated)
- bd-query-helpers.ts (2 uses: resolveTask, getNode)

Pattern:
Before:
import { getNode } from "@km/storage"
const node = getNode(id)

After:
import { createVault, runGenerator, resolvePathArg } from "@km/storage"
const resolved = resolvePathArg(process.cwd(), getRootPath())
using vault = runGenerator(createVault(resolved.vaultRoot))
const node = vault.getNode(id)

Depends on: None (parallel with @km/_orphan/cli-tasks-vault)