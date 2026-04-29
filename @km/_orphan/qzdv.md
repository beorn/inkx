---
id: "@km/_orphan/qzdv"
aliases:
  - km-qzdv
created_at: 2026-01-17T23:15:20Z
closed_at: 2026-01-17T23:18:31Z
---

# [x] Create keybinding resolution layer @km/_orphan #task #P2

## Goal
Create a keybinding system that maps keyboard input to command IDs, separate from command execution.

## Location
`packages/km-commands/src/keybindings.ts`

## Design

```typescript
export interface Keybinding {
  // Key specification
  key: string;          // "j", "Enter", "ArrowUp", etc.
  ctrl?: boolean;
  meta?: boolean;       // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  
  // Command to execute
  commandId: string;
  
  // Mode restrictions
  modes?: CommandMode[];  // defaults to ["normal"]
  
  // Additional context
  when?: (ctx: KeybindingContext) => boolean;  // condition for binding
}

export interface KeybindingContext {
  mode: CommandMode;
  hasSelection: boolean;
  isInDetailPane: boolean;
  isInOutlineMode: boolean;
  currentNode: TNode | null;
}

// Registry
const keybindings: Keybinding[] = [];

export function registerKeybinding(binding: Keybinding): void;
export function resolveKeybinding(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
  ctx: KeybindingContext
): string | null;  // returns command ID or null
```

## Default Keybindings

### Navigation
| Key | Modifiers | Command | Mode |
|-----|-----------|---------|------|
| j / ArrowDown | - | cursor_down | normal |
| k / ArrowUp | - | cursor_up | normal |
| h / ArrowLeft | - | cursor_out | normal |
| l / ArrowRight | - | cursor_in | normal |
| g | - | cursor_first | normal |
| G | - | cursor_last | normal |
| H | - | nav_cross_column_left | normal |
| L | - | nav_cross_column_right | normal |
| [ | - | nav_back | normal |
| ] | - | nav_forward | normal |
| Enter | - | zoom_in | normal |
| Backspace | - | zoom_out | normal |

### Edit
| Key | Modifiers | Command | Mode |
|-----|-----------|---------|------|
| ArrowUp | Alt | move_card_up | normal |
| ArrowDown | Alt | move_card_down | normal |
| ArrowLeft | Alt | move_card_left | normal |
| ArrowRight | Alt | move_card_right | normal |
| Tab | - | indent_node | normal |
| Tab | Shift | outdent_node | normal |
| d | - | delete_node | normal |

### Selection
| Key | Modifiers | Command | Mode |
|-----|-----------|---------|------|
| v | - | select_toggle | normal |
| V | - | select_all_siblings | normal |
| a | Ctrl | select_all | normal |
| Escape | - | clear_selection | normal |
| ArrowUp | Shift | extend_select_up | normal |
| ArrowDown | Shift | extend_select_down | normal |

### Task
| Key | Modifiers | Command | Mode |
|-----|-----------|---------|------|
| Space | - | cycle_task_status | normal |
| x | - | toggle_task_done | normal |

### View
| Key | Modifiers | Command | Mode |
|-----|-----------|---------|------|
| < | - | decrease_outline_depth | normal |
| > | - | increase_outline_depth | normal |
| + | - | increase_content_lines | normal |
| - | - | decrease_content_lines | normal |
| z | - | fold_all | normal |
| Z | - | unfold_all | normal |

## Acceptance Criteria
- [ ] Keybinding registry with add/remove/lookup
- [ ] Mode-aware resolution
- [ ] Modifier key handling (ctrl, meta, shift, alt)
- [ ] Conditional bindings with `when` predicate
- [ ] Default keybindings registered
- [ ] Unit tests for resolution logic
