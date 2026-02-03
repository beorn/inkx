# Command System

## Overview

The command system (`@km/commands`) provides a registry of command definitions and keybindings for the TUI. Commands are pure functions that receive a `CommandContext` and return `CommandAction` values dispatched by the caller.

### Architecture

```
Key press (Ink useInput)
        |
inkKeyToString() + inkKeyToModifiers()
        |
resolveKeybinding(key, modifiers, KeybindingContext)
        |
executeCommand(commandId, CommandContext)
        |
CommandAction returned to caller (TUI handler dispatches)
```

The command system is intentionally decoupled from the TUI: commands know nothing about React, Ink, or the board reducer. The TUI's `board-actions.ts` handles dispatching the returned actions to the appropriate reducer or storage layer.

### Key Design Decisions

- **Commands return actions, not execute them**: Commands are pure functions returning `CommandAction` values. The TUI handler decides how to dispatch each action type (board reducer, storage mutation, UI state change).
- **Keybindings are separate from commands**: A `Keybinding` maps a key+modifiers to a `commandId`. A `CommandDef` defines the command logic. This separation allows the same command to have multiple bindings and enables programmatic execution without keybindings.
- **No global state in commands**: Commands receive all needed state via `CommandContext`. The registry and keybinding list are module-level but created via factory functions for test isolation.

---

## Core Types

### CommandContext

The execution context passed to every command. All fields are pre-computed by the caller.

```typescript
interface CommandContext {
  currentNode: TNode | null
  currentNodeId: string | null
  selectedNodes: string[]
  viewMode: ViewMode
  siblingIndex: number
  siblingCount: number
  columnIndex: number
  columnCount: number
  moveMode: boolean
  foldedNodes: Set<string>
}
```

### CommandDef

A registered command definition.

```typescript
interface CommandDef {
  id: string
  name: string
  description: string
  category: CommandCategory  // "Navigation" | "Selection" | "Edit" | "Task" | "Fold" | "View"
  shortcuts?: string[]
  modes?: CommandMode[]      // "normal" | "move" | "search" | "input"
  execute: (ctx: CommandContext) => CommandAction | CommandAction[] | null
}
```

### CommandAction

The union of all action types a command can return:

| Action group       | Dispatched by       | Examples                                    |
| ------------------ | ------------------- | ------------------------------------------- |
| `BoardAction`      | Board reducer       | `CURSOR_MOVE`, `ZOOM_IN`, `TOGGLE_FOLD`     |
| `NavigationAction` | TUI handler         | `NAV_BACK`, `NAV_FORWARD`, `PAGE_JUMP`      |
| `TaskSetStatusAction` | Storage layer    | `TASK_SET_STATUS`                            |
| `HistoryAction`    | App layer           | `HISTORY_UNDO`, `HISTORY_REDO`              |
| `UIAction`         | TUI handler         | `QUIT`, `SHOW_HELP`, `CYCLE_VIEW_MODE`      |
| `TUIAction`        | TUI handler         | `JUMP_TO_FAVORITE`, `CLOSE_OR_QUIT`         |

### ActionError (Result type)

For command action handlers that can fail expectedly:

```typescript
type ActionError =
  | { type: "boundary"; direction: string }   // User at navigation edge (ring bell)
  | { type: "precondition"; missing: string } // Expected condition not met
  | { type: "unimplemented"; feature: string }

type ActionResult = Result<void, ActionError>
```

Helper constructors: `boundary(dir)`, `precondition(field)`, `unimplemented(feature)`, `ok()`.

---

## Keybindings

### Keybinding type

```typescript
interface Keybinding {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  commandId: string
  modes?: CommandMode[]
  when?: (ctx: KeybindingContext) => boolean
}

interface KeybindingContext {
  mode: CommandMode
  hasSelection: boolean
  isInDetailPane: boolean
  isInOutlineMode: boolean
  currentNode: TNode | null
}
```

### Resolution

First matching keybinding wins. Mode filtering is applied before `when` predicates. Move mode bindings (`modes: ["move"]`) take precedence when active.

```typescript
resolveKeybinding(key: string, modifiers, ctx: KeybindingContext): string | null
```

---

## Ink Adapter

The `ink-adapter.ts` module bridges Ink's `useInput` key events to the command system:

```typescript
// Initialize registry + keybindings (call once at startup)
initCommandSystem()

// Process a key event through the command system
processInkKey(input, key, commandCtx, keybindingCtx): InkCommandResult

// Check if a key would be handled (for fallback logic)
wouldHandleKey(input, key, keybindingCtx): boolean
```

---

## Registry

Commands are registered via `createCommandRegistry()` (factory function) or the module-level default registry:

```typescript
// Factory (test-isolated)
const registry = createCommandRegistry()
registry.registerAll(allCommands)

// Module-level (convenience)
registerCommands(allCommands)
executeCommand("cursor_down", ctx)
```

The registry supports fuzzy filtering for future command palette use:

```typescript
filterCommands("cur")  // matches cursor_down, cursor_up, etc.
```

---

## Command Reference

### Navigation

| ID                    | Name                  | Default Keys         |
| --------------------- | --------------------- | -------------------- |
| `cursor_down`         | Move Down             | `j`, `ArrowDown`     |
| `cursor_up`           | Move Up               | `k`, `ArrowUp`       |
| `cursor_left`         | Move Left             | `h`, `ArrowLeft`     |
| `cursor_right`        | Move Right            | `l`, `ArrowRight`    |
| `cursor_first`        | Move to First         | `g`                  |
| `cursor_last`         | Move to Last          | `G`                  |
| `cursor_prev`         | Move to Previous      | (none)               |
| `cursor_next`         | Move to Next          | (none)               |
| `cursor_in`           | Move to Child         | (none)               |
| `cursor_out`          | Move to Parent        | (none)               |
| `nav_back`            | Navigate Back         | `[`                  |
| `nav_forward`         | Navigate Forward      | `]`                  |
| `zoom_in`             | Zoom In               | `o`                  |
| `zoom_outwards`       | Zoom Outwards         | `u`                  |
| `zoom_inwards`        | Zoom Inwards          | `i`                  |
| `open_detail_pane`    | Open Detail           | `Enter`              |
| `page_down`           | Page Down             | `Ctrl+D`             |
| `page_up`             | Page Up               | `Ctrl+U`             |
| `sibling_board_next`  | Next Sibling Board    | `Ctrl+J`             |
| `sibling_board_prev`  | Previous Sibling Board| `Ctrl+K`             |

### Selection

| ID                        | Name                  | Default Keys              |
| ------------------------- | --------------------- | ------------------------- |
| `select_toggle`           | Toggle Selection      | (none)                    |
| `select_add`              | Add to Selection      | (none)                    |
| `select_remove`           | Remove from Selection | (none)                    |
| `select_all_siblings`     | Select All Siblings   | (none)                    |
| `select_all`              | Select All            | `Ctrl+A`                  |
| `select_all_progressive`  | Progressive Select All| `A`                       |
| `clear_selection`         | Clear Selection       | `Escape`                  |
| `extend_select_up`        | Extend Selection Up   | `Shift+ArrowUp`, `K`      |
| `extend_select_down`      | Extend Selection Down | `Shift+ArrowDown`, `J`    |
| `extend_select_left`      | Extend Selection Left | `Shift+ArrowLeft`, `H`    |
| `extend_select_right`     | Extend Selection Right| `Shift+ArrowRight`, `L`   |

### Edit

| ID                | Name            | Default Keys                       |
| ----------------- | --------------- | ---------------------------------- |
| `enter_move_mode` | Enter Move Mode | `m`                                |
| `confirm_move`    | Confirm Move    | `Enter` (move mode)                |
| `cancel_move`     | Cancel Move     | `Escape` (move mode)               |
| `shift_up`        | Shift Up        | `Alt+ArrowUp`, `Alt+k`             |
| `shift_down`      | Shift Down      | `Alt+ArrowDown`, `Alt+j`           |
| `shift_left`      | Shift Left      | `Alt+ArrowLeft`, `Alt+h`           |
| `shift_right`     | Shift Right     | `Alt+ArrowRight`, `Alt+l`          |
| `delete_node`     | Delete Node     | `D`                                |

### Task

| ID                  | Name            | Default Keys |
| ------------------- | --------------- | ------------ |
| `cycle_task_status` | Cycle Status    | `Space`      |
| `toggle_task_done`  | Toggle Done     | `x`          |
| `set_status_todo`   | Set Todo        | (none)       |
| `set_status_wip`    | Set In Progress | (none)       |
| `set_status_blocked`| Set Blocked     | (none)       |
| `set_status_done`   | Set Done        | (none)       |
| `set_status_dropped`| Set Dropped     | (none)       |

### Fold

| ID                | Name            | Default Keys |
| ----------------- | --------------- | ------------ |
| `toggle_fold`     | Toggle Fold     | `Tab`        |
| `toggle_collapse` | Toggle Collapse | `c`          |
| `fold_all`        | Fold All        | `z`          |
| `unfold_all`      | Unfold All      | `Z`          |

### View

| ID                       | Name              | Default Keys |
| ------------------------ | ----------------- | ------------ |
| `cycle_view_mode`        | Cycle View Mode   | `v`          |
| `show_help`              | Show Help         | `?`          |
| `increase_outline_depth` | Increase Depth    | `>`          |
| `decrease_outline_depth` | Decrease Depth    | `<`          |
| `increase_content_lines` | Show More Content | `+`, `=`     |
| `decrease_content_lines` | Show Less Content | `-`, `_`     |

### History

| ID     | Name   | Default Keys            |
| ------ | ------ | ----------------------- |
| `undo` | Undo   | `Ctrl+Z`               |
| `redo` | Redo   | `Ctrl+Shift+Z`, `Ctrl+Y` |

### TUI-specific

| ID              | Name           | Default Keys      |
| --------------- | -------------- | ----------------- |
| `quit`          | Quit           | `q`               |
| `new_item`      | New Item       | `n`               |
| `project_picker`| Project Picker | `p`               |
| `search`        | Search         | `/`               |
| `favorite_1`-`9`| Favorite 1-9  | `1`-`9`           |
| `column_1`-`9`  | Column 1-9     | `!@#$%^&*(` |
| `close_or_quit` | Close/Quit     | `Escape`          |
| `outdent`       | Outdent        | `Shift+Tab`       |

---

## Adding New Commands

1. **Define the command** in the appropriate category file under `packages/km-commands/src/commands/`:

```typescript
const myCommand = {
  id: "my_command",
  name: "My Command",
  description: "What it does",
  category: "Navigation",
  shortcuts: ["key"],
  execute: (ctx) => {
    if (!ctx.currentNodeId) return null
    return { type: "MY_ACTION", nodeId: ctx.currentNodeId }
  },
} satisfies CommandDef
```

2. **Add to the category's export array** (e.g., `navigationCommands`).

3. **Add a keybinding** in `keybindings.ts` if the command should have a default key:

```typescript
{ key: "key", commandId: "my_command" },
```

4. **Add the action type** to `types.ts` and wire up handling in the TUI's `board-actions.ts`.

5. **Add tests** in `packages/km-commands/tests/`.

---

## See Also

- [architecture.md](../architecture.md) - Overall system architecture
- [ui.md](ui.md) - TUI design system and views
- [testing.md](../dev/testing.md) - Testing commands with mdtest
