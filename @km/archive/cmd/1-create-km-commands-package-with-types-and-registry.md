---
mentions:
  - km
  - km
id: "@km/cmd/1-create-km-commands-package-with-types-and-registry"
aliases:
  - km-cmd.1
  - km-cmd-1
  - "@km/cmd/1"
created_at: 2026-01-17T23:23:34Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Create @km/commands package with types and registry @km/cmd #task #P2

## Goal

Create the foundation package for the unified command system.

## Location

`packages/km-commands/`

## Files to Create

### src/types.ts

- CommandCategory, CommandMode types
- CommandContext interface (currentNode, selectedNodes, cursor, boardState, storage)
- CommandDef interface (id, name, description, category, modes, execute)

### src/registry.ts

- registerCommand(), getCommand(), getAllCommands()
- getCommandsByCategory(), filterCommands()

### src/executor.ts

- executeCommand(id, ctx)
- buildContext(state, ui, storage)

### src/index.ts

Re-export all public API

## Acceptance Criteria

- [ ] Package builds successfully
- [ ] Types exported and usable from other packages
- [ ] Registry CRUD operations work
- [ ] Context builder works with BoardState + UIState
- [ ] Unit tests pass

