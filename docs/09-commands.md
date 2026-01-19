# Command System

## Overview

The command system provides a unified interface for executing actions across all input sources:

- **TUI keyboard shortcuts** - Direct key presses in the terminal UI
- **km-sh shell** - Scriptable command execution (`km sh "cursor:next"`)
- **CLI commands** - Command-line interface (`km cursor next`)
- **Command palette** - Searchable command list (future)

### Benefits

- **Testable**: Commands are pure functions that return actions
- **Scriptable**: Same commands work in shell scripts and automation
- **Discoverable**: Searchable registry with descriptions
- **Type-safe**: Full TypeScript types for context and actions
- **Consistent**: Same behavior across all input sources

---

## Architecture

```
Input Sources (keyboard, km-sh, CLI, palette)
        ↓
Keybinding Resolution (maps keys → command IDs)
        ↓
Command Registry (@km/commands)
        ↓
Command Execution (ctx → Action[])
        ↓
Action Dispatcher (routes to reducers + storage)
```

### Flow Example

1. User presses `j` in TUI
2. Keybinding layer maps `j` → `cursor_next` (in normal mode)
3. Command registry looks up `cursor_next` command
4. Command executes with current context
5. Returns `{ type: "CURSOR_NEXT" }` action
6. Action dispatches to board reducer
7. State updates, UI re-renders

---

## CommandDef Interface

```typescript
interface CommandDef {
  id: string; // snake_case: "cursor_next"
  name: string; // "Move Down"
  description: string; // "Move cursor to next sibling"
  category: CommandCategory;
  execute: (ctx: CommandContext) => BoardAction | BoardAction[] | null;
}
```

### Field Details

| Field         | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `id`          | Unique identifier, snake_case for shell/CLI use |
| `name`        | Human-readable name for palette/help            |
| `description` | Longer description for documentation            |
| `category`    | Grouping for organization and filtering         |
| `execute`     | Pure function that produces actions             |

### Execute Return Values

- **Single action**: `{ type: "CURSOR_NEXT" }`
- **Multiple actions**: `[action1, action2]` for compound operations
- **No-op**: `null` when command doesn't apply (e.g., can't move further)

---

## CommandContext

Commands receive a read-only context describing the current state:

```typescript
interface CommandContext {
  // Current cursor position
  currentNode: KMNode | null;
  currentNodeId: string | null;
  cursor: number;

  // Selection state
  selectedNodes: string[];
  selectionMode: "single" | "multi" | "range";

  // Board state (read-only snapshot)
  boardState: BoardState;
  viewMode: ViewMode;

  // Navigation helpers
  siblingCount: number;
  siblingIndex: number;
  columnIndex: number;
  columnCount: number;

  // Tree context
  parentId: string | null;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
}
```

### Why Read-Only?

Commands never mutate state directly. They return actions that describe _what should happen_. This enables:

- Testing without mocking
- Undo/redo via action history
- Consistent state transitions

---

## Command Categories

### Navigation

Cursor movement, zoom, history navigation.

| Command           | Description              |
| ----------------- | ------------------------ |
| `cursor_next`     | Move to next sibling     |
| `cursor_prev`     | Move to previous sibling |
| `cursor_parent`   | Move to parent           |
| `cursor_child`    | Move to first child      |
| `cursor_first`    | Move to first sibling    |
| `cursor_last`     | Move to last sibling     |
| `zoom_in`         | Zoom into current node   |
| `zoom_out`        | Zoom out to parent       |
| `history_back`    | Navigate history back    |
| `history_forward` | Navigate history forward |

### Selection

Single, multi, and range selection.

| Command           | Description               |
| ----------------- | ------------------------- |
| `select_toggle`   | Toggle selection on node  |
| `select_range`    | Select range from anchor  |
| `select_all`      | Select all visible nodes  |
| `select_none`     | Clear selection           |
| `select_children` | Select all children       |
| `select_extend`   | Extend selection by one   |
| `select_shrink`   | Shrink selection by one   |

### Edit

Mutations that return TAction for storage sync.

| Command         | Description                 |
| --------------- | --------------------------- |
| `delete`        | Delete selected nodes       |
| `move_up`       | Move node up in siblings    |
| `move_down`     | Move node down in siblings  |
| `indent`        | Indent node (make child)    |
| `outdent`       | Outdent node (make sibling) |
| `edit_title`    | Enter edit mode for title   |
| `edit_content`  | Enter edit mode for content |

### Task

Task-specific status changes.

| Command             | Description             |
| ------------------- | ----------------------- |
| `task_toggle`       | Toggle done/todo        |
| `task_cancel`       | Mark task cancelled     |
| `task_set_priority` | Set task priority       |
| `task_set_status`   | Set arbitrary status    |

### Fold

Expand/collapse tree nodes.

| Command          | Description            |
| ---------------- | ---------------------- |
| `fold_toggle`    | Toggle fold state      |
| `fold_expand`    | Expand node            |
| `fold_collapse`  | Collapse node          |
| `fold_all`       | Collapse all nodes     |
| `unfold_all`     | Expand all nodes       |
| `fold_level`     | Fold to specific level |

### View

Display settings.

| Command             | Description                |
| ------------------- | -------------------------- |
| `view_depth_inc`    | Increase visible depth     |
| `view_depth_dec`    | Decrease visible depth     |
| `view_content_more` | Show more content lines    |
| `view_content_less` | Show fewer content lines   |
| `view_mode_tree`    | Switch to tree view        |
| `view_mode_board`   | Switch to board view       |
| `view_mode_list`    | Switch to list view        |

---

## Keybinding System

Keybindings are **separate from commands**. This enables:

- Mode-aware bindings (different keys in different modes)
- User customization without changing command code
- Multiple keys for the same command
- Context-dependent bindings

### Keybinding Structure

```typescript
interface Keybinding {
  key: string; // "j", "ArrowDown", "Enter"
  command: string; // Command ID to execute
  mode?: Mode; // Optional: only active in this mode
  modifiers?: Modifier[]; // ctrl, meta, shift, alt
  when?: (ctx: CommandContext) => boolean; // Conditional binding
}
```

### Mode Awareness

| Mode     | Description                 |
| -------- | --------------------------- |
| `normal` | Default navigation/commands |
| `move`   | Node movement mode          |
| `search` | Search/filter mode          |
| `input`  | Text input mode             |

### Keybindings Reference

#### Navigation

| Key             | Command         | Description              |
| --------------- | --------------- | ------------------------ |
| `j`, `Down`     | `cursor_next`   | Move to next sibling     |
| `k`, `Up`       | `cursor_prev`   | Move to previous sibling |
| `h`, `Left`     | `cursor_parent` | Move to parent           |
| `l`, `Right`    | `cursor_child`  | Move to first child      |
| `g`             | `cursor_first`  | Move to first sibling    |
| `G`             | `cursor_last`   | Move to last sibling     |
| `H`             | `column_prev`   | Previous column (board)  |
| `L`             | `column_next`   | Next column (board)      |
| `[`             | `history_back`  | Navigate back in history |
| `]`             | `history_fwd`   | Navigate forward         |
| `Enter`         | `zoom_in`       | Zoom into node           |
| `Backspace`     | `zoom_out`      | Zoom out to parent       |

#### Edit

| Key              | Command     | Description       |
| ---------------- | ----------- | ----------------- |
| `Alt+Up`         | `move_up`   | Move node up      |
| `Alt+Down`       | `move_down` | Move node down    |
| `Tab`            | `indent`    | Indent node       |
| `Shift+Tab`      | `outdent`   | Outdent node      |
| `d`              | `delete`    | Delete node       |

#### Selection

| Key              | Command         | Description          |
| ---------------- | --------------- | -------------------- |
| `v`              | `select_toggle` | Toggle selection     |
| `V`              | `select_range`  | Range select         |
| `Ctrl+A`         | `select_all`    | Select all           |
| `Escape`         | `select_none`   | Clear selection      |
| `Shift+Down`     | `select_extend` | Extend selection     |
| `Shift+Up`       | `select_shrink` | Shrink selection     |

#### Task

| Key     | Command       | Description      |
| ------- | ------------- | ---------------- |
| `Space` | `task_toggle` | Toggle done/todo |
| `x`     | `task_cancel` | Cancel task      |

#### View

| Key | Command             | Description            |
| --- | ------------------- | ---------------------- |
| `<` | `view_depth_dec`    | Decrease visible depth |
| `>` | `view_depth_inc`    | Increase visible depth |
| `+` | `view_content_more` | Show more content      |
| `-` | `view_content_less` | Show less content      |
| `z` | `fold_toggle`       | Toggle fold            |
| `Z` | `fold_all`          | Fold all               |

---

## Adding New Commands

### Step 1: Define the Command

Create the command definition in the appropriate category file:

```typescript
// packages/km-commands/src/navigation.ts
export const cursorJumpToLine: CommandDef = {
  id: "cursor_jump_to_line",
  name: "Jump to Line",
  description: "Jump cursor to a specific line number",
  category: "navigation",
  execute: (ctx) => {
    // Commands should be pure - return action or null
    if (!ctx.targetLine) return null;
    return { type: "CURSOR_SET", payload: { line: ctx.targetLine } };
  },
};
```

### Step 2: Register the Command

Add to the command registry:

```typescript
// packages/km-commands/src/registry.ts
import { cursorJumpToLine } from "./navigation";

export const commands: CommandDef[] = [
  // ... existing commands
  cursorJumpToLine,
];
```

### Step 3: Add Keybinding (Optional)

If the command should have a keyboard shortcut:

```typescript
// packages/km-commands/src/keybindings.ts
export const keybindings: Keybinding[] = [
  // ... existing bindings
  {
    key: ":",
    command: "cursor_jump_to_line",
    mode: "normal",
  },
];
```

### Step 4: Handle the Action

Ensure the board reducer handles the new action type:

```typescript
// packages/km-board/src/boardReducer.ts
case "CURSOR_SET":
  return { ...state, cursor: action.payload.line };
```

### Step 5: Add Tests

```typescript
// packages/km-commands/tests/navigation.test.ts
describe("cursor_jump_to_line", () => {
  it("returns CURSOR_SET action with target line", () => {
    const ctx = mockContext({ targetLine: 5 });
    const result = cursorJumpToLine.execute(ctx);
    expect(result).toEqual({ type: "CURSOR_SET", payload: { line: 5 } });
  });

  it("returns null when no target line", () => {
    const ctx = mockContext({ targetLine: undefined });
    expect(cursorJumpToLine.execute(ctx)).toBeNull();
  });
});
```

### Step 6: Document

Add to the appropriate category table in this document.

---

## See Also

- [02-architecture.md](02-architecture.md) - Overall system architecture
- [06-ui.md](06-ui.md) - TUI design system and views
- [dev/testing.md](dev/testing.md) - Testing commands with mdtest
