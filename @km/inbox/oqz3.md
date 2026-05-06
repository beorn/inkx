---
mentions:
  - km
id: "@km/inbox/oqz3"
aliases:
  - km-oqz3
  - "@km/_orphan/oqz3"
created_at: 2026-01-16T10:53:29Z
closed_at: 2026-01-16T11:20:28Z
---

# [x] Refactor: Align tui-core with km-tui-state.md architecture @km/_orphan #task #P2

@km/_orphan/tui-core/treeReducer.ts violates the layer boundaries defined in @km/tui-state/md. Need to refactor to align with the correct architecture.

## Current Problems

### 1. @km/_orphan/tui-core/treeReducer.ts is a monolith

Contains ALL of:

- Node queries (should be @km/core/node)
- Board state: cursor, selection, fold, zoom, history (should be @km/core/board)
- Modal state: search, help, newItem, projectPicker (should be @km/tui)
- Visual navigation (should be @km/core/board/spatialNav.ts)

### 2. Duplication with @km/_orphan/core

- @km/_orphan/core/board/boardReducer.ts already exists and is correctly structured
- @km/_orphan/core/node/queries.ts already has getNodeAtPath etc.
- But @km/_orphan/tui-core duplicates all this

### 3. Selection in wrong layer

Selection is currently mixed into the 'tree' state but it's visual/board state, not node structure.

## Correct Architecture (per @km/tui-state/md)

```
@km/core/node     - NodeState, queries (getNodeAtPath, getSiblings)
                  - NO selection, NO cursor, NO visual state
                  
@km/core/board    - BoardState (cursor, selection, fold, zoom, history)
                  - boardReducer for navigation/selection actions
                  - spatialNav.ts for CURSOR_* visual traversal
                  
@km/tui-core      - Shell commands (km sh), text utils, icons
                  - Should import from @km/core, not duplicate
                  
@km/tui           - AppState (modals, view config)
                  - React components, rendering
```

## Refactoring Plan

### Phase 1: Consolidate reducers

1. @km/_orphan/tui-core/treeReducer.ts should IMPORT from @km/_orphan/core/board/boardReducer.ts
2. Move modal state (search, help, etc.) to @km/tui appReducer
3. Remove duplicated code

### Phase 2: Add visual navigation to @km/_orphan/core/board

1. Create @km/_orphan/core/board/spatialNav.ts for CURSOR_* helpers
2. Add CURSOR_* action handling to @km/_orphan/core/board/boardReducer.ts
3. @km/_orphan/tui-core just re-exports or wraps

### Phase 3: Clean up @km/_orphan/tui-core

After consolidation, @km/_orphan/tui-core should only contain:

- Shell-specific code (commandParser, shellExecutor)
- Text/icon utilities
- Re-exports from @km/_orphan/core for convenience

## Acceptance Criteria

- [ ] No duplicated reducer logic between packages
- [ ] Selection is in BoardState, not mixed with nodes
- [ ] Modal state is in TUI layer, not board layer
- [ ] Visual navigation (CURSOR_*) is in @km/_orphan/core/board/spatialNav.ts
- [ ] All tests pass
- [ ] km sh still works

## Dependencies

Should be done BEFORE implementing @km/_orphan/t2q4 (CURSOR_* actions) to avoid putting them in the wrong place.

