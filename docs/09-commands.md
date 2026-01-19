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
  name: string; // "Move to Next"
  description: string; // "Move cursor to next sibling"
  category: CommandCategory;
  shortcuts?: string[]; // Optional: default keybindings
  modes?: CommandMode[]; // Optional: active only in these modes
  execute: (ctx: CommandContext) => CommandAction | CommandAction[] | null;
}

type CommandCategory =
  | "Navigation"
  | "Selection"
  | "Edit"
  | "Task"
  | "Fold"
  | "View";
type CommandMode = "normal" | "move" | "search" | "input";
```

### Field Details

| Field         | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `id`          | Unique identifier, snake_case for shell/CLI use |
| `name`        | Human-readable name for palette/help            |
| `description` | Longer description for documentation            |
| `category`    | Grouping for organization and filtering         |
| `shortcuts`   | Optional array of default key bindings          |
| `modes`       | Optional array of modes where command is active |
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
  // Current node and cursor
  currentNode: TNode | null;
  currentNodeId: string | null;
  cursor: TPath; // Array of indices representing path from root

  // Selection state
  selectedNodes: string[];

  // Board state (read-only snapshot)
  boardState: BoardState;
  viewMode: ViewMode;

  // Navigation helpers
  siblingCount: number;
  siblingIndex: number;
  columnIndex: number;
  columnCount: number;
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

| Command                  | Description                 |
| ------------------------ | --------------------------- |
| `cursor_next`            | Move to next sibling        |
| `cursor_prev`            | Move to previous sibling    |
| `cursor_in`              | Move into first child       |
| `cursor_out`             | Move to parent              |
| `cursor_first`           | Move to first sibling       |
| `cursor_last`            | Move to last sibling        |
| `cursor_up`              | Move up visually            |
| `cursor_down`            | Move down visually          |
| `cursor_left`            | Move left (cross-column)    |
| `cursor_right`           | Move right (cross-column)   |
| `nav_cross_column_left`  | Navigate to column on left  |
| `nav_cross_column_right` | Navigate to column on right |
| `nav_back`               | Navigate history back       |
| `nav_forward`            | Navigate history forward    |
| `zoom_in`                | Zoom into current node      |
| `zoom_out`               | Zoom out to parent          |

### Selection

Single, multi, and range selection.

| Command               | Description                   |
| --------------------- | ----------------------------- |
| `select_toggle`       | Toggle selection on node      |
| `select_add`          | Add current node to selection |
| `select_remove`       | Remove node from selection    |
| `select_all_siblings` | Select all siblings           |
| `select_all`          | Select all visible nodes      |
| `clear_selection`     | Clear all selections          |
| `extend_select_up`    | Extend selection upward       |
| `extend_select_down`  | Extend selection downward     |
| `extend_select_left`  | Extend selection leftward     |
| `extend_select_right` | Extend selection rightward    |

### Edit

Mutations and move mode commands.

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `enter_move_mode` | Start moving selected nodes         |
| `confirm_move`    | Confirm node movement (move mode)   |
| `cancel_move`     | Cancel move operation (move mode)   |
| `shift_up`        | Move node up among siblings         |
| `shift_down`      | Move node down among siblings       |
| `shift_left`      | Move node to parent level (outdent) |
| `shift_right`     | Move node under sibling (indent)    |
| `undo`            | Undo the last action                |
| `redo`            | Redo the last undone action         |

### Task

Task-specific status changes.

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `cycle_task_status`  | Cycle through statuses (todo/wip/done/dropped) |
| `toggle_task_done`   | Toggle between done and todo                   |
| `set_status_todo`    | Set task status to todo                        |
| `set_status_wip`     | Set task status to work in progress            |
| `set_status_blocked` | Set task status to blocked                     |
| `set_status_done`    | Mark task as done                              |
| `set_status_dropped` | Mark task as dropped/cancelled                 |

### Fold

Expand/collapse tree nodes.

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `toggle_fold`     | Toggle fold state              |
| `toggle_collapse` | Toggle column collapse (board) |
| `fold_all`        | Fold all nodes at depth 1      |
| `unfold_all`      | Unfold all nodes               |

### View

Display settings.

| Command                  | Description               |
| ------------------------ | ------------------------- |
| `increase_outline_depth` | Show more nested levels   |
| `decrease_outline_depth` | Show fewer nested levels  |
| `increase_content_lines` | Show more content preview |
| `decrease_content_lines` | Show less content preview |

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
  commandId: string; // Command ID to execute
  ctrl?: boolean; // Ctrl modifier
  meta?: boolean; // Cmd/Meta modifier
  shift?: boolean; // Shift modifier
  alt?: boolean; // Alt/Option modifier
  modes?: CommandMode[]; // Optional: only active in these modes
  when?: (ctx: KeybindingContext) => boolean; // Conditional binding
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

| Key          | Command                  | Description                  |
| ------------ | ------------------------ | ---------------------------- |
| `j`          | `cursor_next`            | Move to next sibling         |
| `k`          | `cursor_prev`            | Move to previous sibling     |
| `h`          | `cursor_out`             | Move to parent               |
| `l`          | `cursor_in`              | Move into first child        |
| `g`          | `cursor_first`           | Move to first sibling        |
| `G`          | `cursor_last`            | Move to last sibling         |
| `ArrowDown`  | `cursor_down`            | Move down visually           |
| `ArrowUp`    | `cursor_up`              | Move up visually             |
| `ArrowLeft`  | `cursor_left`            | Move left (cross-column)     |
| `ArrowRight` | `cursor_right`           | Move right (cross-column)    |
| `H`          | `nav_cross_column_left`  | Navigate to column on left   |
| `L`          | `nav_cross_column_right` | Navigate to column on right  |
| `[`          | `nav_back`               | Navigate back in history     |
| `]`          | `nav_forward`            | Navigate forward in history  |
| `Enter`      | `zoom_in`                | Zoom into node (normal mode) |
| `Backspace`  | `zoom_out`               | Zoom out to parent           |
| `u`          | `zoom_out`               | Zoom out to parent           |

#### Selection

| Key           | Command               | Description            |
| ------------- | --------------------- | ---------------------- |
| `v`           | `select_toggle`       | Toggle selection       |
| `V`           | `select_all_siblings` | Select all siblings    |
| `Ctrl+A`      | `select_all`          | Select all             |
| `Escape`      | `clear_selection`     | Clear selection        |
| `Shift+Up`    | `extend_select_up`    | Extend selection up    |
| `Shift+Down`  | `extend_select_down`  | Extend selection down  |
| `Shift+Left`  | `extend_select_left`  | Extend selection left  |
| `Shift+Right` | `extend_select_right` | Extend selection right |

#### Edit

| Key             | Command           | Description              |
| --------------- | ----------------- | ------------------------ |
| `m`             | `enter_move_mode` | Start move mode          |
| `Enter` (move)  | `confirm_move`    | Confirm move (move mode) |
| `Escape` (move) | `cancel_move`     | Cancel move (move mode)  |
| `Alt+Up`        | `shift_up`        | Move node up             |
| `Alt+Down`      | `shift_down`      | Move node down           |
| `Alt+Left`      | `shift_left`      | Outdent node             |
| `Alt+Right`     | `shift_right`     | Indent node              |
| `Alt+k`         | `shift_up`        | Move node up             |
| `Alt+j`         | `shift_down`      | Move node down           |
| `Alt+h`         | `shift_left`      | Outdent node             |
| `Alt+l`         | `shift_right`     | Indent node              |
| `Tab`           | `shift_right`     | Indent node              |
| `Shift+Tab`     | `shift_left`      | Outdent node             |
| `Ctrl+Z`        | `undo`            | Undo last action         |
| `Ctrl+Shift+Z`  | `redo`            | Redo undone action       |
| `Ctrl+Y`        | `redo`            | Redo undone action       |

#### Task

| Key     | Command             | Description              |
| ------- | ------------------- | ------------------------ |
| `Space` | `cycle_task_status` | Cycle through statuses   |
| `x`     | `toggle_task_done`  | Toggle between done/todo |

#### Fold

| Key       | Command           | Description            |
| --------- | ----------------- | ---------------------- |
| `z`       | `toggle_fold`     | Toggle fold            |
| `c`       | `toggle_collapse` | Toggle column collapse |
| `Z`       | `fold_all`        | Fold all nodes         |
| `Shift+Z` | `unfold_all`      | Unfold all nodes       |

#### View

| Key     | Command                  | Description            |
| ------- | ------------------------ | ---------------------- |
| `<`     | `decrease_outline_depth` | Decrease visible depth |
| `>`     | `increase_outline_depth` | Increase visible depth |
| `+`/`=` | `increase_content_lines` | Show more content      |
| `-`/`_` | `decrease_content_lines` | Show less content      |

---

## Adding New Commands

### Step 1: Define the Command

Create the command definition in the appropriate category file:

```typescript
// packages/km-commands/src/commands/navigation.ts
export const cursorJumpToLine: CommandDef = {
  id: "cursor_jump_to_line",
  name: "Jump to Line",
  description: "Jump cursor to a specific line number",
  category: "Navigation",
  shortcuts: [":"],
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
export const defaultKeybindings: Keybinding[] = [
  // ... existing bindings
  {
    key: ":",
    commandId: "cursor_jump_to_line",
    modes: ["normal"],
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
