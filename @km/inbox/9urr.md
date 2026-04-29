---
id: "@km/_orphan/9urr"
aliases:
  - km-9urr
created_at: 2026-01-16T10:59:32Z
closed_at: 2026-01-16T11:20:19Z
---

# [x] Refactor: Rename packages to @km/tree, @km/board, @km/tui @km/_orphan #task #P1

Major refactoring to clarify package boundaries and naming.

## Current State (Confusing)

```
@km/core/node     - Node types, queries
@km/core/board    - Board state, reducer
@km/tui-core      - DUPLICATES @km/core + shell commands + modal state mixed in
@km/tui-opentui   - OpenTUI React app
apps/km-cli       - CLI entry point
```

## Target State (Clear)

```
@km/tree          - Content/structural data model
                    NodeState, CursorPath, queries (getNodeAtPath, getSiblings)
                    NO visual navigation, NO UI state
                    
@km/board         - Visual board data model  
                    BoardState (cursor, selection, fold, zoom, history)
                    boardReducer, spatialNav.ts
                    Maps visual directions to structural/tree model
                    NO modal/UI state, NO rendering
                    
@km/tui           - TUI app/board
                    AppState (modal state, view config)
                    React components, rendering
                    Key → action mapping
                    
apps/km-cli       - CLI entry point (run-do-exit commands)
                    Calls @km/tui for 'view' command
                    km sh can live here or in @km/sh
```

## Package Mapping

| Old | New | Notes |
|-----|-----|-------|
| @km/core/node | @km/tree | Rename + promote to package |
| @km/core/board | @km/board | Rename + promote to package |
| @km/tui-core | DELETE | Merge shell into @km/_orphan/cli, delete duplication |
| @km/tui-opentui | @km/tui | Rename |
| @km/core | Assess | May still need for shared types (TaskStatus, etc.) |

## Detailed Changes

### 1. Create @km/tree (from @km/core/node)
- Move packages/@km/_orphan/core/src/node/* to packages/@km/tree/src/
- Rename NodeState → TreeNode or keep as NodeState
- Ensure NO visual state (cursor, selection, etc.)

### 2. Create @km/board (from @km/core/board)
- Move packages/@km/_orphan/core/src/board/* to packages/@km/_orphan/board/src/
- Add spatialNav.ts for CURSOR_* algorithms
- Import @km/tree for node queries
- Ensure NO modal/UI state

### 3. Refactor @km/tui (from @km/tui-opentui)
- Rename packages/@km/_orphan/tui-opentui to packages/@km/tui
- Remove treeReducer duplication - use @km/board/boardReducer
- Extract AppState for modal/view config (separate from BoardState)
- Keep React components

### 4. Clean up apps/@km/_orphan/cli
- Keep CLI commands (sync, tasks, etc.)
- Import @km/tui for view command
- Shell (km sh) can stay here or move to @km/sh

### 5. Delete @km/tui-core
- Move commandParser, shellExecutor to apps/@km/_orphan/cli (or @km/sh)
- Delete duplicated types.ts, treeReducer.ts

### 6. Update docs
- specs/@km/tui-state/md - Update package references
- specs/@km/board-navigation/md - Update architecture section
- specs/README.md - Update package list
- CLAUDE.md - Update if needed

## Acceptance Criteria
- [ ] @km/tree exists with node types and queries only
- [ ] @km/board exists with board state and navigation only
- [ ] @km/tui exists with React app and modal state only
- [ ] No duplication between packages
- [ ] All imports updated throughout codebase
- [ ] All tests pass
- [ ] km view works
- [ ] km sh works
- [ ] Docs updated

## Dependencies
This blocks all other navigation work:
- @km/_orphan/t2q4 (CURSOR_* actions)
- @km/_orphan/js8s (extend-select)
- @km/_orphan/uwdy (shifting)

## Migration Strategy
1. Create new packages with correct structure
2. Update imports in consuming code
3. Delete old duplicated code
4. Update docs
5. Run all tests