---
mentions:
  - km
  - km
id: "@km/cmd/migrate"
aliases:
  - km-cmd.migrate
  - km-cmd-migrate
created_at: 2026-01-19T12:03:29Z
closed_at: 2026-01-20T00:49:19Z
---

# [x] Migrate TUI to @km/board state model @km/cmd #epic #P1

## Overview

Migrate the TUI (Board.tsx, keyboard-handler.ts) from its column-based state model to @km/board's tree-based BoardState model. This enables the command system (@km/commands) to work directly with the TUI.

**IMPORTANT**: All work should be done in a git worktree (`km-migrate-worktree`) to avoid conflicts with other in-progress work.

## Background

The @km/commands package was added but is **completely disconnected** from the TUI:

- `command-bridge.ts` was written but never called
- `keyboard-handler.ts` handles all input with direct setState/dispatch
- Two incompatible state models exist

### Why This Matters

1. Commands are tested in isolation but don't actually work
2. Keybindings defined in @km/commands don't match TUI behavior
3. No type safety between command actions and TUI state updates
4. Duplicate logic: commands define navigation, keyboard-handler reimplements it

## State Model Comparison

### Current TUI Model (apps/@km/tui/packages/@km/_orphan/ink/src/types.ts)

```typescript
BoardState {
  rootId: string | null
  rootPath: string | null
  columns: ColumnState[]     // Column array
  colIndex: number           // Fixed 2-level cursor
  cardIndex: number
  selectedCards: Set<string> // "col:card:sub" format
  foldedCards: Set<string>
  collapsedColumns: Set<number>  // Indices, not IDs
  zoomStack: string[]        // IDs only
  // + TUI-specific: searchQuery, searchMode, helpMode
}
```

### Target Model (packages/@km/_orphan/board/src/boardTypes.ts)

```typescript
BoardState {
  rootId: string | null
  rootPath: string | null
  nodes: TNode[]             // Tree structure
  cursor: TPath              // [col, card, sub...] arbitrary depth
  selectedNodes: Set<string> // Node IDs
  foldedNodes: Set<string>
  collapsedNodes: Set<string>   // Node IDs
  zoomStack: Array<{rootId, cursor}>  // Remembers cursor position
  navHistory: Array<{rootId, cursor}>
  navHistoryIndex: number
  moveMode, moveSourceNodes, moveSourceCursor
  maxOutlineDepth, maxContentLines
}
```

### Key Mapping

| TUI Concept        | Tree Concept    | TPath Representation                 |
| ------------------ | --------------- | ------------------------------------ |
| Column             | Top-level node  | [colIndex]                           |
| Card               | Child of column | [colIndex, cardIndex]                |
| Sub-item (outline) | Deeper child    | [colIndex, cardIndex, subIndex, ...] |
| ui.subIndex        | cursor depth    | cursor.length > 2 means outline mode |

## Keybinding Audit

Commands must match actual TUI behavior. **CRITICAL**: Fix these before wiring up.

| Key       | @km/commands Current  | Actual TUI Behavior                    | Required Fix                                   |
| --------- | --------------------- | -------------------------------------- | ---------------------------------------------- |
| v         | select_toggle         | cycleViewMode                          | Remove binding OR add cycle_view_mode command  |
| h         | cursor_out            | Close detail pane (context) / left nav | Context-aware: when in detail pane, close it   |
| u         | zoom_out              | Go up physical path                    | Different from zoom! Keep both, bind correctly |
| o         | (none)                | zoom_in                                | Add binding: o → zoom_in                       |
| Enter     | zoom_in (normal mode) | Open detail pane                       | Change: Enter → show_detail_pane               |
| Tab       | shift_right (indent)  | Toggle fold                            | Change: Tab → toggle_fold                      |
| Tab+Shift | shift_left (outdent)  | Outdent                                | Correct - keep                                 |
| ?         | (none)                | toggleHelp                             | Add binding                                    |
| n         | (none)                | showNewItemDialog                      | Add binding                                    |
| q         | (none)                | quit                                   | Add binding                                    |
| p         | (none)                | showProjectPicker                      | Add binding                                    |
| D         | (none)                | deleteCard                             | Add binding                                    |

### Missing Commands to Add

- `cycle_view_mode` - cycles through board/list/outline views
- `show_detail_pane` - opens detail pane for current card
- `show_help` - shows help overlay
- `show_new_item_dialog` - opens new item creation
- `show_project_picker` - opens project picker dialog
- `delete_card` - deletes current card
- `quit` - exits the TUI

## Implementation Phases

### Phase 0: Setup Worktree

```bash
cd /Users/beorn/Code/pim/km
git worktree add ../km-migrate-worktree -b km-migrate
cd ../km-migrate-worktree
bun install
```

### Phase 1: Keybinding Fix (Non-Breaking)

**Goal**: Update keybindings to match TUI, add missing commands.

Files:

- `packages/km-commands/src/keybindings.ts` - fix bindings
- `packages/km-commands/src/commands/view.ts` - add cycle_view_mode
- `packages/km-commands/src/commands/navigation.ts` - ensure zoom_in/zoom_out are correct
- `packages/km-commands/tests/keybindings.test.ts` - update tests

Verification: `bun test packages/km-commands`

### Phase 2: Adapter Layer (Non-Breaking)

**Goal**: Create bidirectional state conversion without changing behavior.

Create `apps/km-tui/packages/km-ink/src/board-adapter.ts`:

```typescript
// Convert TUI state to tree state
export function toTreeState(tui: TUIBoardState, ui: UIState): TreeBoardState

// Convert tree state back to TUI state  
export function fromTreeState(tree: TreeBoardState): TUIBoardState

// Convert columns/cards to TNode tree
function columnsToNodes(columns: ColumnState[]): TNode[]

// Convert TNode tree back to columns/cards
function nodesToColumns(nodes: TNode[]): ColumnState[]
```

Create `apps/km-tui/packages/km-ink/tests/board-adapter.test.ts`:

- Round-trip conversion tests
- Edge cases (empty columns, nested items, selection)

Verification: `bun test apps/km-tui/packages/km-ink/tests/board-adapter.test.ts`

### Phase 3: Add boardReducer to Board.tsx

**Goal**: Run boardReducer alongside existing state, sync back.

Modify `apps/km-tui/packages/km-ink/src/views/Board.tsx`:

```tsx
import { boardReducer } from "@km/board";
import { toTreeState, fromTreeState } from "../board-adapter.ts";

// Add alongside existing useState
const [treeState, dispatchBoard] = useReducer(
  boardReducer,
  toTreeState(initialState, initialUI)
);

// Sync tree state changes back to TUI state
useEffect(() => {
  const tuiState = fromTreeState(treeState);
  setState(tuiState);
}, [treeState]);
```

Verification: TUI should work identically (adapter is transparent)

### Phase 4: Migrate Navigation Keys

**Goal**: Route navigation through dispatchBoard instead of setState.

Modify `apps/km-tui/packages/km-ink/src/keyboard-handler.ts`:

**Update KeyboardContext**:

```typescript
interface KeyboardContext {
  state: BoardState;          // Keep for now
  treeState: TreeBoardState;  // Add
  ui: UIState;
  setState: ...;              // Keep for now
  dispatchBoard: Dispatch<BoardAction>;  // Add
  dispatch: ...;
  exit: () => void;
}
```

**Migrate one key at a time**, test after each:

1. `j`/`↓` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "down" })`
2. `k`/`↑` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "up" })`
3. `h`/`←` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "left" })`
4. `l`/`→` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "right" })`
5. `g` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "first" })`
6. `G` → `dispatchBoard({ type: "CURSOR_MOVE", dir: "last" })`
7. `Tab` → `dispatchBoard({ type: "TOGGLE_FOLD", nodeId })`
8. `z`/`Z` → `dispatchBoard({ type: "FOLD_LEVEL/UNFOLD_LEVEL" })`
9. `c` → `dispatchBoard({ type: "TOGGLE_COLLAPSE", nodeId })`
10. `[`/`]` → `dispatchBoard({ type: "NAV_BACK/NAV_FORWARD" })`
11. `o` → `dispatchBoard({ type: "ZOOM_IN", nodeId, nodes })`
12. `u` (zoom out) → `dispatchBoard({ type: "ZOOM_OUT", nodes })`

### Phase 5: Migrate Selection Keys

- `Shift+J/K` → `EXTEND_SELECT_DOWN/UP`
- `Shift+H/L` → `EXTEND_SELECT_LEFT/RIGHT`
- `Shift+A` → `SELECT_ALL_SIBLINGS` then `SELECT_ALL`
- `Escape` (when has selection) → `CLEAR_SELECTION`

### Phase 6: Merge subIndex into Cursor

**Goal**: Eliminate ui.subIndex, use cursor[2+] for outline depth.

Modify `apps/km-tui/packages/km-ink/src/ui-reducer.ts`:

- Remove `subIndex` from UIState
- Remove `setSubIndex` action

Update outline mode detection:

```typescript
function isInOutlineMode(cursor: TPath): boolean {
  return cursor.length > 2;
}
```

### Phase 7: Update Components

**Goal**: Components receive TNode instead of ColumnState/CardState.

Files to update:

- `ColumnsView.tsx` - receive nodes[] instead of columns[]
- `TreeNode.tsx` - already uses TNode-like interface
- `DetailPane.tsx` - receive TNode

### Phase 8: Clean Up

- Remove adapter layer (direct TNode usage)
- Remove deprecated types from types.ts
- Update buildBoardState to return TNode tree directly
- Remove command-bridge.ts (no longer needed)

## What Stays in keyboard-handler.ts

**Storage mutations** (call @km/storage, then dispatch REFRESH):

- `moveCardInColumn()` → `moveNode()` + `dispatchBoard({ type: "REFRESH", nodes })`
- `moveCardToColumn()` → `moveNode()` + refresh
- Status cycling (Space) → `updateNode()` + refresh
- Delete (D) → `deleteNode()` + refresh
- Indent/outdent → `moveNode()` + refresh

**UI-only actions** (dispatch to uiReducer):

- `cycleViewMode()` - changes view mode
- `toggleHelp()` - shows help overlay
- `showDetailPane()` - opens detail pane
- `showProjectPicker()` - opens picker dialog
- `showNewItemDialog()` - opens creation dialog

**TUI-specific** (no command equivalent):

- Favorites (1-9 keys) - jump to specific boards
- Shift+1-9 - column jump
- Quit (q)

## Files to Modify (Complete List)

### Phase 1 (Keybindings)

- `packages/km-commands/src/keybindings.ts`
- `packages/km-commands/src/commands/view.ts`
- `packages/km-commands/tests/keybindings.test.ts`

### Phase 2 (Adapter)

- `apps/km-tui/packages/km-ink/src/board-adapter.ts` (NEW)
- `apps/km-tui/packages/km-ink/tests/board-adapter.test.ts` (NEW)

### Phase 3-5 (Core Migration)

- `apps/km-tui/packages/km-ink/src/views/Board.tsx`
- `apps/km-tui/packages/km-ink/src/keyboard-handler.ts`
- `apps/km-tui/packages/km-ink/src/types.ts` (KeyboardContext)

### Phase 6 (subIndex)

- `apps/km-tui/packages/km-ink/src/ui-reducer.ts`

### Phase 7 (Components)

- `apps/km-tui/packages/km-ink/src/views/ColumnsView.tsx`
- `apps/km-tui/packages/km-ink/src/views/TreeNode.tsx`
- `apps/km-tui/packages/km-ink/src/views/DetailPane.tsx`

### Phase 8 (Cleanup)

- `apps/km-tui/packages/km-ink/src/state.ts`
- `apps/km-tui/packages/km-ink/src/types.ts`
- `apps/km-tui/packages/km-ink/src/command-bridge.ts` (DELETE)

## Verification Strategy

### After Each Phase

1. `bun run test:fast` - must pass (< 5s)
2. Smoke test TUI manually
3. Commit if passing

### Before Final Merge

1. `bun run test:all` - full test suite
2. Complete manual test checklist

### Manual Test Checklist

- [ ] Navigation: j/k/h/l moves cursor correctly
- [ ] Navigation: arrows work same as hjkl
- [ ] Navigation: g/G go to first/last
- [ ] Selection: Shift+arrows extend selection
- [ ] Selection: Shift+A progressive select
- [ ] Selection: Escape clears selection
- [ ] Fold: Tab toggles fold on card
- [ ] Fold: z folds all, Z unfolds all
- [ ] Collapse: c toggles column collapse
- [ ] Zoom: o zooms into card, u zooms out
- [ ] History: [ goes back, ] goes forward
- [ ] View: v cycles view mode
- [ ] Status: Space cycles task status
- [ ] Move: Alt+arrows move cards
- [ ] Indent: Tab/Shift+Tab indent/outdent (in context)
- [ ] Detail: Enter opens detail pane, h/Escape closes
- [ ] Help: ? shows help, Escape closes
- [ ] Quit: q exits, Escape exits (when nothing else to close)

## Risk Mitigation

1. **Git worktree**: All work in `km-migrate-worktree`
2. **Phase 1-2 non-breaking**: Can ship independently, no behavior change
3. **Incremental commits**: Each phase committed separately
4. **Keep old types**: Don't remove until Phase 8
5. **Parallel state**: Tree state syncs to TUI state, not replacing

## Estimated Effort

| Phase | Description        | Estimate     |
| ----- | ------------------ | ------------ |
| 0     | Setup worktree     | 5 min        |
| 1     | Keybinding fix     | 1-2 hours    |
| 2     | Adapter layer      | 2-3 hours    |
| 3     | Add boardReducer   | 1 hour       |
| 4     | Migrate navigation | 3-4 hours    |
| 5     | Migrate selection  | 1-2 hours    |
| 6     | Merge subIndex     | 1 hour       |
| 7     | Update components  | 2-3 hours    |
| 8     | Clean up           | 1 hour       |
| Total |                    | ~13-17 hours |

## Success Criteria

1. All TUI functionality works identically to before migration
2. @km/commands is connected and processing keyboard input
3. boardReducer is the source of truth for navigation state
4. All tests pass (unit + mdtest + e2e)
5. No performance regression (measure render time before/after)
6. command-bridge.ts deleted (replaced by proper integration)

