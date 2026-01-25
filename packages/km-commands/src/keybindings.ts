import type { CommandMode, TNode } from "./types.ts"

export interface Keybinding {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  commandId: string
  modes?: CommandMode[]
  when?: (ctx: KeybindingContext) => boolean
}

export interface KeybindingContext {
  mode: CommandMode
  hasSelection: boolean
  isInDetailPane: boolean
  isInOutlineMode: boolean
  currentNode: TNode | null
}

const keybindings: Keybinding[] = []

export function registerKeybinding(binding: Keybinding): void {
  keybindings.push(binding)
}

export function registerKeybindings(bindings: Keybinding[]): void {
  keybindings.push(...bindings)
}

export function clearKeybindings(): void {
  keybindings.length = 0
}

export function getAllKeybindings(): Keybinding[] {
  return [...keybindings]
}

export function resolveKeybinding(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
  ctx: KeybindingContext,
): string | null {
  for (const binding of keybindings) {
    // Check key match
    if (binding.key !== key) continue

    // Check modifiers
    if (!!binding.ctrl !== !!modifiers.ctrl) continue
    if (!!binding.meta !== !!modifiers.meta) continue
    // For single uppercase letters (A-Z), the shift key is implicit in the character
    // Don't require explicit shift: true in the binding for capital letters
    const isUppercaseLetter =
      key.length === 1 && key >= "A" && key <= "Z" && !binding.shift
    if (!isUppercaseLetter && !!binding.shift !== !!modifiers.shift) continue
    if (!!binding.alt !== !!modifiers.alt) continue

    // Check mode
    if (binding.modes && binding.modes.length > 0) {
      if (!binding.modes.includes(ctx.mode)) continue
    }

    // Check conditional
    if (binding.when && !binding.when(ctx)) continue

    return binding.commandId
  }
  return null
}

// Default keybindings
// NOTE: These match docs/06-ui.md Navigation Model
export const defaultKeybindings: Keybinding[] = [
  // === Navigation ===
  // Visual navigation (j/k/arrows) - document traversal, crosses tree levels
  // Per docs/06-ui.md: j at column level enters first card, k at first card exits to column
  { key: "j", commandId: "cursor_down" }, // Next visible block (enters children, crosses siblings)
  { key: "k", commandId: "cursor_up" }, // Previous visible block (exits to parent, crosses siblings)
  { key: "h", commandId: "cursor_left" }, // Move left (column) - TUI: also closes detail pane contextually
  { key: "l", commandId: "cursor_right" }, // Move right (column)
  { key: "g", commandId: "cursor_first" }, // Move to first item in list
  { key: "G", commandId: "cursor_last" }, // Move to last item in list

  // Arrows behave identically to hjkl per docs/06-ui.md
  { key: "ArrowDown", commandId: "cursor_down" },
  { key: "ArrowUp", commandId: "cursor_up" },
  { key: "ArrowLeft", commandId: "cursor_left" },
  { key: "ArrowRight", commandId: "cursor_right" },

  // History navigation
  { key: "[", commandId: "nav_back" },
  { key: "]", commandId: "nav_forward" },

  // Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
  { key: "d", ctrl: true, commandId: "page_down" },
  { key: "u", ctrl: true, commandId: "page_up" },

  // Sibling board navigation
  { key: "j", ctrl: true, commandId: "sibling_board_next" },
  { key: "k", ctrl: true, commandId: "sibling_board_prev" },

  // Zoom/Navigate
  { key: "o", commandId: "zoom_in" }, // TUI uses 'o' for zoom in (focus on node)
  { key: "i", commandId: "zoom_inwards" }, // Zoom in one level closer to selected node
  { key: "u", commandId: "zoom_outwards" }, // Zoom out one level (parent of root)
  { key: "Enter", commandId: "open_detail_pane", modes: ["normal"] }, // Open detail pane for current node

  // === Selection ===
  // NOTE: 'v' is NOT select_toggle in TUI - it cycles view mode
  // Progressive select all with Shift+A
  { key: "A", commandId: "select_all_progressive" },
  // NOTE: Escape is handled by close_or_quit in TUI section below

  // Extend selection with Shift+movement
  { key: "ArrowUp", shift: true, commandId: "extend_select_up" },
  { key: "ArrowDown", shift: true, commandId: "extend_select_down" },
  { key: "ArrowLeft", shift: true, commandId: "extend_select_left" },
  { key: "ArrowRight", shift: true, commandId: "extend_select_right" },
  { key: "K", commandId: "extend_select_up" }, // Shift+K
  { key: "J", commandId: "extend_select_down" }, // Shift+J
  { key: "H", commandId: "extend_select_left" }, // Shift+H
  { key: "L", commandId: "extend_select_right" }, // Shift+L

  // === Edit ===
  { key: "m", commandId: "enter_move_mode" },
  { key: "Enter", commandId: "confirm_move", modes: ["move"] },
  { key: "Escape", commandId: "cancel_move", modes: ["move"] },
  { key: "D", commandId: "delete_node" }, // Delete with confirmation

  // Shifting (Alt/Meta+direction) - move nodes in tree
  { key: "ArrowUp", meta: true, commandId: "shift_up" },
  { key: "ArrowDown", meta: true, commandId: "shift_down" },
  { key: "ArrowLeft", meta: true, commandId: "shift_left" },
  { key: "ArrowRight", meta: true, commandId: "shift_right" },
  { key: "k", meta: true, commandId: "shift_up" },
  { key: "j", meta: true, commandId: "shift_down" },
  { key: "h", meta: true, commandId: "shift_left" },
  { key: "l", meta: true, commandId: "shift_right" },

  // Tab toggles fold on current card (TUI behavior)
  { key: "Tab", commandId: "toggle_fold" },
  // Shift+Tab outdents node
  { key: "Tab", shift: true, commandId: "outdent" },

  // === Task ===
  { key: " ", commandId: "cycle_task_status" },

  // === Fold ===
  // z/Z behavior from keyboard-handler.ts:
  // - z (lowercase) = fold all cards in current column
  // - Z (uppercase) = unfold all cards in current column
  { key: "z", commandId: "fold_all" },
  { key: "Z", commandId: "unfold_all" },
  { key: "c", commandId: "toggle_collapse" }, // Toggle column collapse

  // === View ===
  { key: "v", commandId: "cycle_view_mode" }, // TUI: cycles through view modes
  { key: "?", commandId: "show_help" }, // Toggle help overlay
  { key: "<", commandId: "decrease_outline_depth" },
  { key: ">", commandId: "increase_outline_depth" },
  { key: "+", commandId: "increase_content_lines" },
  { key: "=", commandId: "increase_content_lines" },
  { key: "-", commandId: "decrease_content_lines" },
  { key: "_", commandId: "decrease_content_lines" },

  // === History (Undo/Redo) ===
  { key: "z", ctrl: true, commandId: "undo" },
  { key: "z", ctrl: true, shift: true, commandId: "redo" },
  { key: "y", ctrl: true, commandId: "redo" },

  // === TUI-specific ===
  { key: "q", commandId: "quit" },
  { key: "n", commandId: "new_item" },
  { key: "p", commandId: "project_picker" },

  // Favorites (1-9) - jump to favorite boards
  { key: "1", commandId: "favorite_1" },
  { key: "2", commandId: "favorite_2" },
  { key: "3", commandId: "favorite_3" },
  { key: "4", commandId: "favorite_4" },
  { key: "5", commandId: "favorite_5" },
  { key: "6", commandId: "favorite_6" },
  { key: "7", commandId: "favorite_7" },
  { key: "8", commandId: "favorite_8" },
  { key: "9", commandId: "favorite_9" },

  // Column jump (Shift+1-9 produces these characters)
  { key: "!", commandId: "column_1" },
  { key: "@", commandId: "column_2" },
  { key: "#", commandId: "column_3" },
  { key: "$", commandId: "column_4" },
  { key: "%", commandId: "column_5" },
  { key: "^", commandId: "column_6" },
  { key: "&", commandId: "column_7" },
  { key: "*", commandId: "column_8" },
  { key: "(", commandId: "column_9" },

  // Contextual close/quit (Escape)
  // Closes dialogs, panes, modes, or quits if nothing to close
  { key: "Escape", commandId: "close_or_quit" },
]

// Initialize with defaults
export function initDefaultKeybindings(): void {
  clearKeybindings()
  registerKeybindings(defaultKeybindings)
}
