# Command System

## Overview

The command system provides a unified interface for executing actions across all input sources:

- **TUI keyboard shortcuts** - Direct key presses in the terminal UI
- **km-sh shell** - Scriptable command execution (`km sh "cursor:next"`)
- **CLI commands** - Command-line interface (`km cursor next`)
- **Command palette** - Searchable command list (future)

### Benefits

- **Testable**: Commands are pure functions with injectable context
- **Scriptable**: Same commands work in shell scripts and automation
- **Discoverable**: Searchable registry with descriptions
- **Type-safe**: Full TypeScript types for context and predicates
- **Consistent**: Same behavior across all input sources

---

## Architecture

```
Input Sources (keyboard, km-sh, CLI, palette)
        ↓
Key Normalization (unifies key formats)
        ↓
Binding Resolution (first-match with when predicates)
        ↓
Command Execution (cmd(ctx) - direct execution)
        ↓
State Updates (reducers + storage)
```

### Flow Example

1. User presses `j` in TUI
2. Key normalized to `"j"`
3. Bindings scanned in order; first match where `when(ctx)` is true wins
4. If on board: `j` → `cursorNext`; if in picker: `j` → `pickerNext`
5. Command executes: `cursorNext(ctx)` dispatches to reducer
6. State updates, UI re-renders

---

## Core Types

### Current Implementation

The actual `CommandContext` in `@km/commands` (see [types.ts](../packages/km-commands/src/types.ts)):

```typescript
interface CommandContext {
  currentNode: TNode | null
  currentNodeId: string | null
  selectedNodes: string[]
  cursor: TPath
  boardState: BoardState
  viewMode: ViewMode
  siblingCount: number
  siblingIndex: number
  columnIndex: number
  columnCount: number
}
```

### Design Target (Future)

The full context interface planned for when commands need storage access and dispatchers:

```typescript
// Context passed to commands and when predicates
interface Ctx {
  // === LAYER STATE ===
  layer: "board" | "pane" | "dialog"
  dialog: "help" | "projectPicker" | "newItem" | null
  pane: "detail" | null
  mode: "normal" | "move"

  // === SELECTION ===
  hasSelection: boolean
  multiSelection: Set<string>
  clipboardHasNodes: boolean

  // === CURSOR ===
  node: TNode | null
  knode: KNode | null
  column: number
  card: number
  path: TPath

  // === DERIVED ===
  nodeIsTask: boolean
  nodeHasChildren: boolean
  taskStatus: TaskStatus | null
  canZoomIn: boolean
  canZoomOut: boolean
  canNavBack: boolean
  canNavForward: boolean
  inOutlineMode: boolean

  // === DISPATCHERS ===
  dispatch: Dispatch<UIAction>
  dispatchBoard: Dispatch<BoardAction>
  exit: () => void

  // === STORAGE ===
  storage: StorageInterface

  // === OPERATIONS ===
  refresh: () => void
  buildTree: (rootId: string | null) => TNode[]
  clearSelection: () => void
}
```

// Command: function that executes with context
type Cmd = (ctx: Ctx) => void;

// When predicate: TypeScript function for conditional bindings
type When = (ctx: Ctx) => boolean;

// Binding: maps keys to commands with optional conditions
interface Binding {
keys: string[];
cmd: Cmd;
when?: When;
}

````

### Why Direct Execution?

Commands execute directly rather than returning action descriptors. This enables:

- Simpler code (no interpreter/switch statement)
- Type-safe storage access via `ctx.storage`
- Commands can do multiple operations atomically
- Testing with mock context

---

## Bindings

Bindings connect keys to commands with optional when predicates:

```typescript
// Common condition helpers
const onBoard: When = (c) => c.layer === "board";
const onPane: When = (c) => c.layer === "pane";
const onDialog: When = (c) => c.layer === "dialog";
const inMoveMode: When = (c) => c.mode === "move";
const hasTask: When = (c) => c.nodeIsTask;
const hasChildren: When = (c) => c.nodeHasChildren;

// Example bindings
const BINDINGS: Binding[] = [
  // Same key, different commands based on context
  {
    keys: ["j"],
    cmd: cursorNext,
    when: (c) => onBoard(c) || c.pane === "detail",
  },
  { keys: ["j"], cmd: pickerNext, when: (c) => c.dialog === "projectPicker" },
  { keys: ["j"], cmd: moveDest, when: inMoveMode },

  // Conditional on node properties
  { keys: ["x"], cmd: cycleTaskStatus, when: (c) => onBoard(c) && hasTask(c) },
  { keys: ["Tab"], cmd: toggleFold, when: (c) => onBoard(c) && hasChildren(c) },

  // Modal-specific
  { keys: ["Escape"], cmd: closeDialog, when: onDialog },
  { keys: ["Escape"], cmd: cancelMove, when: inMoveMode },
  {
    keys: ["Escape"],
    cmd: clearSelection,
    when: (c) => onBoard(c) && c.hasSelection,
  },
];
````

### Resolution

```typescript
function resolveBinding(key: string, ctx: Ctx): Cmd | null {
  for (const b of BINDINGS) {
    if (b.keys.includes(key) && (!b.when || b.when(ctx))) {
      return b.cmd
    }
  }
  return null
}
```

First matching binding wins. This enables context layering where dialogs take precedence over board keybindings.

---

## Command Categories

### Navigation

Cursor movement, zoom, history navigation.

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `cursorNext`       | Move to next sibling               |
| `cursorPrev`       | Move to previous sibling           |
| `cursorIn`         | Move into first child              |
| `cursorOut`        | Move to parent                     |
| `cursorFirst`      | Move to first sibling              |
| `cursorLast`       | Move to last sibling               |
| `cursorUp`         | Move up visually                   |
| `cursorDown`       | Move down visually                 |
| `cursorLeft`       | Move left (cross-column)           |
| `cursorRight`      | Move right (cross-column)          |
| `pageDown`         | Jump cursor down half a page       |
| `pageUp`           | Jump cursor up half a page         |
| `navBack`          | Navigate history back              |
| `navForward`       | Navigate history forward           |
| `zoomIn`           | Zoom into current node             |
| `zoomOut`          | Zoom out to parent                 |
| `zoomInwards`      | Zoom inwards one level             |
| `siblingBoardNext` | Navigate to next sibling board     |
| `siblingBoardPrev` | Navigate to previous sibling board |
| `openDetail`       | Open detail pane for current node  |

### Selection

Single, multi, and range selection.

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `selectToggle`      | Toggle selection on node      |
| `selectAdd`         | Add current node to selection |
| `selectRemove`      | Remove node from selection    |
| `selectAllSiblings` | Select all siblings           |
| `progressiveSelect` | Progressive select all (A)    |
| `clearSelection`    | Clear all selections          |
| `extendSelectUp`    | Extend selection upward       |
| `extendSelectDown`  | Extend selection downward     |
| `extendSelectLeft`  | Extend selection leftward     |
| `extendSelectRight` | Extend selection rightward    |

### Edit

Mutations and move mode commands.

| Command         | Description                         |
| --------------- | ----------------------------------- |
| `enterMoveMode` | Start moving selected nodes         |
| `confirmMove`   | Confirm node movement (move mode)   |
| `cancelMove`    | Cancel move operation (move mode)   |
| `shiftUp`       | Move node up among siblings         |
| `shiftDown`     | Move node down among siblings       |
| `shiftLeft`     | Move node to parent level (outdent) |
| `shiftRight`    | Move node under sibling (indent)    |
| `deleteNode`    | Delete current node                 |
| `undo`          | Undo the last action                |
| `redo`          | Redo the last undone action         |

### Task

Task-specific status changes.

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `cycleTaskStatus`  | Cycle through statuses (todo/wip/done/dropped) |
| `toggleDone`       | Toggle between done and todo                   |
| `setStatusTodo`    | Set task status to todo                        |
| `setStatusWip`     | Set task status to work in progress            |
| `setStatusBlocked` | Set task status to blocked                     |
| `setStatusDone`    | Mark task as done                              |
| `setStatusDropped` | Mark task as dropped/cancelled                 |

### Fold

Expand/collapse tree nodes.

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `toggleFold`     | Toggle fold state              |
| `toggleCollapse` | Toggle column collapse (board) |
| `foldAll`        | Fold all nodes at depth 1      |
| `unfoldAll`      | Unfold all nodes               |

### View

Display settings and UI actions.

| Command                | Description               |
| ---------------------- | ------------------------- |
| `cycleViewMode`        | Cycle through view modes  |
| `toggleHelp`           | Toggle help overlay       |
| `increaseOutlineDepth` | Show more nested levels   |
| `decreaseOutlineDepth` | Show fewer nested levels  |
| `increaseContentLines` | Show more content preview |
| `decreaseContentLines` | Show less content preview |

### Dialog

Modal dialog commands.

| Command         | Description             |
| --------------- | ----------------------- |
| `closeDialog`   | Close current dialog    |
| `pickerNext`    | Next item in picker     |
| `pickerPrev`    | Previous item in picker |
| `pickerSelect`  | Select item in picker   |
| `newItem`       | Open new item dialog    |
| `projectPicker` | Open project picker     |

### App

Application-level commands.

| Command         | Description                |
| --------------- | -------------------------- |
| `quit`          | Exit the TUI               |
| `favorite1`-`9` | Jump to favorite board 1-9 |
| `column1`-`9`   | Jump to column 1-9         |

---

## Context Layers

The command system uses context layers to handle modal state:

```
dialog (highest priority)
   ↓
pane (detail pane open)
   ↓
board (default)
```

When predicates can check the current layer:

```typescript
// Only active on board layer
{ keys: ["j"], cmd: cursorNext, when: c => c.layer === "board" }

// Only in project picker dialog
{ keys: ["j"], cmd: pickerNext, when: c => c.dialog === "projectPicker" }

// In move mode (a sub-mode of board)
{ keys: ["j"], cmd: moveDest, when: c => c.mode === "move" }
```

### Layer Values

| Field    | Values                                           |
| -------- | ------------------------------------------------ |
| `layer`  | `"board"`, `"pane"`, `"dialog"`                  |
| `dialog` | `"help"`, `"projectPicker"`, `"newItem"`, `null` |
| `pane`   | `"detail"`, `null`                               |
| `mode`   | `"normal"`, `"move"`                             |

---

## Keybindings Reference

#### Navigation

| Key          | Command            | When Condition           |
| ------------ | ------------------ | ------------------------ |
| `j`          | `cursorNext`       | board or detail pane     |
| `k`          | `cursorPrev`       | board or detail pane     |
| `h`          | `cursorLeft`       | board                    |
| `l`          | `cursorRight`      | board                    |
| `g`          | `cursorFirst`      | board                    |
| `G`          | `cursorLast`       | board                    |
| `ArrowDown`  | `cursorDown`       | board                    |
| `ArrowUp`    | `cursorUp`         | board                    |
| `ArrowLeft`  | `cursorLeft`       | board                    |
| `ArrowRight` | `cursorRight`      | board                    |
| `Ctrl+D`     | `pageDown`         | board                    |
| `Ctrl+U`     | `pageUp`           | board                    |
| `[`          | `navBack`          | board && canNavBack      |
| `]`          | `navForward`       | board && canNavForward   |
| `o`          | `zoomIn`           | board && canZoomIn       |
| `i`          | `zoomInwards`      | board                    |
| `u`          | `zoomOut`          | canZoomOut               |
| `Ctrl+J`     | `siblingBoardNext` | board                    |
| `Ctrl+K`     | `siblingBoardPrev` | board                    |
| `Enter`      | `openDetail`       | board && pane !== detail |

#### Selection

| Key           | Command             | When Condition        |
| ------------- | ------------------- | --------------------- |
| `A`           | `progressiveSelect` | board                 |
| `Escape`      | `clearSelection`    | board && hasSelection |
| `Shift+Up`    | `extendSelectUp`    | board                 |
| `Shift+Down`  | `extendSelectDown`  | board                 |
| `Shift+Left`  | `extendSelectLeft`  | board                 |
| `Shift+Right` | `extendSelectRight` | board                 |
| `K`           | `extendSelectUp`    | board                 |
| `J`           | `extendSelectDown`  | board                 |
| `H`           | `extendSelectLeft`  | board                 |
| `L`           | `extendSelectRight` | board                 |

> **Note**: `Escape` has multiple bindings with different when conditions. First match wins: dialog > move mode > selection > pane.

#### Edit

| Key            | Command         | When Condition                       |
| -------------- | --------------- | ------------------------------------ |
| `m`            | `enterMoveMode` | board && hasSelection && mode=normal |
| `Enter`        | `confirmMove`   | mode=move                            |
| `Escape`       | `cancelMove`    | mode=move                            |
| `d`            | `deleteNode`    | board && hasSelection                |
| `Cmd+Up`       | `shiftUp`       | board                                |
| `Cmd+Down`     | `shiftDown`     | board                                |
| `Cmd+Left`     | `shiftLeft`     | board                                |
| `Cmd+Right`    | `shiftRight`    | board                                |
| `Cmd+k`        | `shiftUp`       | board                                |
| `Cmd+j`        | `shiftDown`     | board                                |
| `Cmd+h`        | `shiftLeft`     | board                                |
| `Cmd+l`        | `shiftRight`    | board                                |
| `Tab`          | `toggleFold`    | board && nodeHasChildren             |
| `Shift+Tab`    | `shiftLeft`     | board                                |
| `Ctrl+Z`       | `undo`          | board                                |
| `Ctrl+Shift+Z` | `redo`          | board                                |
| `Ctrl+Y`       | `redo`          | board                                |

#### Task

| Key     | Command           | When Condition      |
| ------- | ----------------- | ------------------- |
| `x`     | `cycleTaskStatus` | board && nodeIsTask |
| `X`     | `toggleDone`      | board && nodeIsTask |
| `Space` | `cycleTaskStatus` | board && nodeIsTask |

#### Fold

| Key   | Command          | When Condition           |
| ----- | ---------------- | ------------------------ |
| `Tab` | `toggleFold`     | board && nodeHasChildren |
| `z`   | `foldAll`        | board                    |
| `Z`   | `unfoldAll`      | board                    |
| `c`   | `toggleCollapse` | board                    |

#### View

| Key     | Command                | When Condition  |
| ------- | ---------------------- | --------------- |
| `v`     | `cycleViewMode`        | board           |
| `?`     | `toggleHelp`           | dialog !== help |
| `<`     | `decreaseOutlineDepth` | board           |
| `>`     | `increaseOutlineDepth` | board           |
| `+`/`=` | `increaseContentLines` | board           |
| `-`/`_` | `decreaseContentLines` | board           |

#### Dialog

| Key      | Command        | When Condition       |
| -------- | -------------- | -------------------- |
| `j`      | `pickerNext`   | dialog=projectPicker |
| `k`      | `pickerPrev`   | dialog=projectPicker |
| `Enter`  | `pickerSelect` | dialog=projectPicker |
| `Escape` | `closeDialog`  | dialog (any)         |
| `Escape` | `toggleHelp`   | dialog=help          |

#### App

| Key         | Command         | When Condition   |
| ----------- | --------------- | ---------------- |
| `q`         | `quit`          | layer !== dialog |
| `n`         | `newItem`       | board            |
| `p`         | `projectPicker` | board            |
| `1`-`9`     | `favorite1`-`9` | board            |
| `!@#$%^&*(` | `column1`-`9`   | board            |

> **Favorite boards**: 1=@inbox, 2=@next, 3=@waiting, 4=@someday, 5=@projects, 6=@areas, 7=@archive, 8=@reference, 9=@goals

---

## Adding New Commands

### Step 1: Define the Command

Create the command function in the appropriate category file:

```typescript
// packages/km-commands/src/commands/navigation.ts
export const cursorJumpToLine: Cmd = (ctx) => {
  if (!ctx.targetLine) return
  ctx.dispatchBoard({ type: "CURSOR_SET", line: ctx.targetLine })
}
```

### Step 2: Add Binding

Add to the bindings array with optional when predicate:

```typescript
// packages/km-commands/src/bindings.ts
export const BINDINGS: Binding[] = [
  // ... existing bindings
  {
    keys: [":"],
    cmd: cursorJumpToLine,
    when: (c) => c.layer === "board",
  },
]
```

### Step 3: Add Tests

```typescript
// packages/km-commands/tests/navigation.test.ts
describe("cursorJumpToLine", () => {
  it("dispatches CURSOR_SET with target line", () => {
    const ctx = mockCtx({ targetLine: 5 })
    cursorJumpToLine(ctx)
    expect(ctx.dispatchBoard).toHaveBeenCalledWith({
      type: "CURSOR_SET",
      line: 5,
    })
  })

  it("does nothing when no target line", () => {
    const ctx = mockCtx({ targetLine: undefined })
    cursorJumpToLine(ctx)
    expect(ctx.dispatchBoard).not.toHaveBeenCalled()
  })
})

describe("bindings", () => {
  it(": resolves to cursorJumpToLine on board", () => {
    const ctx = mockCtx({ layer: "board" })
    expect(resolveBinding(":", ctx)).toBe(cursorJumpToLine)
  })

  it(": does not resolve in dialog", () => {
    const ctx = mockCtx({ layer: "dialog" })
    expect(resolveBinding(":", ctx)).toBeNull()
  })
})
```

### Step 4: Document

Add to the appropriate category table in this document.

---

## See Also

- [02-architecture.md](02-architecture.md) - Overall system architecture
- [06-ui.md](06-ui.md) - TUI design system and views
- [dev/testing.md](dev/testing.md) - Testing commands with mdtest
