import type { CommandMode, TNode } from "./types.ts";

export interface Keybinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  commandId: string;
  modes?: CommandMode[];
  when?: (ctx: KeybindingContext) => boolean;
}

export interface KeybindingContext {
  mode: CommandMode;
  hasSelection: boolean;
  isInDetailPane: boolean;
  isInOutlineMode: boolean;
  currentNode: TNode | null;
}

const keybindings: Keybinding[] = [];

export function registerKeybinding(binding: Keybinding): void {
  keybindings.push(binding);
}

export function registerKeybindings(bindings: Keybinding[]): void {
  keybindings.push(...bindings);
}

export function clearKeybindings(): void {
  keybindings.length = 0;
}

export function getAllKeybindings(): Keybinding[] {
  return [...keybindings];
}

export function resolveKeybinding(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean },
  ctx: KeybindingContext,
): string | null {
  for (const binding of keybindings) {
    // Check key match
    if (binding.key !== key) continue;

    // Check modifiers
    if (!!binding.ctrl !== !!modifiers.ctrl) continue;
    if (!!binding.meta !== !!modifiers.meta) continue;
    if (!!binding.shift !== !!modifiers.shift) continue;
    if (!!binding.alt !== !!modifiers.alt) continue;

    // Check mode
    if (binding.modes && binding.modes.length > 0) {
      if (!binding.modes.includes(ctx.mode)) continue;
    }

    // Check conditional
    if (binding.when && !binding.when(ctx)) continue;

    return binding.commandId;
  }
  return null;
}

// Default keybindings
// NOTE: These match the actual TUI keyboard-handler.ts behavior
export const defaultKeybindings: Keybinding[] = [
  // === Navigation ===
  // Structural (hjkl) - move within tree structure
  { key: "j", commandId: "cursor_next" }, // Move to next sibling / down in list
  { key: "k", commandId: "cursor_prev" }, // Move to previous sibling / up in list
  { key: "h", commandId: "cursor_left" }, // Move left (column) - TUI: also closes detail pane contextually
  { key: "l", commandId: "cursor_right" }, // Move right (column)
  { key: "g", commandId: "cursor_first" }, // Move to first item in list
  { key: "G", commandId: "cursor_last" }, // Move to last item in list

  // Visual (arrows) - same as hjkl
  { key: "ArrowDown", commandId: "cursor_down" },
  { key: "ArrowUp", commandId: "cursor_up" },
  { key: "ArrowLeft", commandId: "cursor_left" },
  { key: "ArrowRight", commandId: "cursor_right" },

  // History navigation
  { key: "[", commandId: "nav_back" },
  { key: "]", commandId: "nav_forward" },

  // Zoom/Navigate
  { key: "o", commandId: "zoom_in" }, // TUI uses 'o' for zoom in
  { key: "u", commandId: "go_up_path" }, // Go up physical path (parent of root)
  { key: "Enter", commandId: "open_detail_pane", modes: ["normal"] }, // Open detail view

  // === Selection ===
  // NOTE: 'v' is NOT select_toggle in TUI - it cycles view mode
  // Progressive select all with Shift+A
  { key: "A", commandId: "select_all_progressive" },
  { key: "Escape", commandId: "clear_selection" },

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

  // Indent/Outdent with Tab (same as shift left/right)
  { key: "Tab", commandId: "shift_right" },
  { key: "Tab", shift: true, commandId: "shift_left" },

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
];

// Initialize with defaults
export function initDefaultKeybindings(): void {
  clearKeybindings();
  registerKeybindings(defaultKeybindings);
}
