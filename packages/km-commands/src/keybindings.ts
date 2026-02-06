import type { CommandMode, TNode } from "./types.ts"
import type { WhenPredicate } from "./when.ts"
import { textInputFocused, isInDetailPane, isInlineEditing } from "./when.ts"

export interface Keybinding {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  commandId: string
  modes?: CommandMode[]
  when?: WhenPredicate | ((ctx: KeybindingContext) => boolean)
}

export interface KeybindingContext {
  mode: CommandMode
  hasSelection: boolean
  isInDetailPane: boolean
  isInOutlineMode: boolean
  isInlineEditing: boolean
  currentNode: TNode | null
  textInputFocused: boolean
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
  // === Block editing (when isInlineEditing) ===
  // Up/Down navigate between blocks (title + body paragraphs)
  // Must come before text editing bindings to intercept these keys
  {
    key: "ArrowUp",
    commandId: "edit_block.navigate_up",
    when: isInlineEditing,
  },
  {
    key: "ArrowDown",
    commandId: "edit_block.navigate_down",
    when: isInlineEditing,
  },

  // === Text editing (when textInputFocused) ===
  // These must come first so they take priority over navigation keys
  {
    key: "Backspace",
    commandId: "text.delete_backward",
    when: textInputFocused,
  },
  { key: "Delete", commandId: "text.delete_forward", when: textInputFocused },
  { key: "ArrowLeft", commandId: "text.cursor_left", when: textInputFocused },
  { key: "ArrowRight", commandId: "text.cursor_right", when: textInputFocused },
  {
    key: "a",
    ctrl: true,
    commandId: "text.cursor_start",
    when: textInputFocused,
  },
  {
    key: "e",
    ctrl: true,
    commandId: "text.cursor_end",
    when: textInputFocused,
  },
  {
    key: "b",
    ctrl: true,
    commandId: "text.cursor_left",
    when: textInputFocused,
  },
  {
    key: "f",
    ctrl: true,
    commandId: "text.cursor_right",
    when: textInputFocused,
  },
  {
    key: "w",
    ctrl: true,
    commandId: "text.delete_word",
    when: textInputFocused,
  },
  {
    key: "u",
    ctrl: true,
    commandId: "text.delete_to_start",
    when: textInputFocused,
  },
  {
    key: "k",
    ctrl: true,
    commandId: "text.delete_to_end",
    when: textInputFocused,
  },
  // Enter during text input → confirm (save+exit for inline edit, submit for search)
  {
    key: "Enter",
    commandId: "text.confirm",
    when: textInputFocused,
  },
  { key: "Escape", commandId: "text.cancel", when: textInputFocused },

  // === Detail pane (when isInDetailPane) ===
  // Escape closes detail pane (before normal Escape handling)
  // Note: h does NOT have a separate detail_pane.close binding.
  // Instead, cursor_left handles detail pane close contextually in board-actions-nav.ts
  // because in list view showDetailPane=true by default and h must still navigate.
  { key: "Escape", commandId: "detail_pane.close", when: isInDetailPane },

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
  { key: "Enter", commandId: "enter_inline_edit", modes: ["normal"] }, // Edit node title inline
  { key: "e", commandId: "zoom_in" }, // Zoom into node (show children as board)
  { key: "o", commandId: "open_in_system" }, // Open file/folder in macOS (Finder/editor)
  { key: "O", commandId: "open_in_terminal" }, // Open terminal at closest folder
  { key: "i", commandId: "zoom_inwards" }, // Zoom in one level closer to selected node
  { key: "u", commandId: "zoom_outwards" }, // Zoom out one level (parent of root)

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
  { key: "/", commandId: "search" },

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
  // Note: Allow Meta modifier (terminal emulation quirk — some terminals send Alt+Escape)
  { key: "Escape", commandId: "close_or_quit" },
  { key: "Escape", meta: true, commandId: "close_or_quit" },
]

// Initialize with defaults
export function initDefaultKeybindings(): void {
  clearKeybindings()
  registerKeybindings(defaultKeybindings)
}
