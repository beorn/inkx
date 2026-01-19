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
export const defaultKeybindings: Keybinding[] = [
  // === Navigation ===
  // Structural (hjkl)
  { key: "j", commandId: "cursor_next" },
  { key: "k", commandId: "cursor_prev" },
  { key: "h", commandId: "cursor_out" },
  { key: "l", commandId: "cursor_in" },
  { key: "g", commandId: "cursor_first" },
  { key: "G", commandId: "cursor_last" },

  // Visual (arrows)
  { key: "ArrowDown", commandId: "cursor_down" },
  { key: "ArrowUp", commandId: "cursor_up" },
  { key: "ArrowLeft", commandId: "cursor_left" },
  { key: "ArrowRight", commandId: "cursor_right" },

  // Cross-column
  { key: "H", commandId: "nav_cross_column_left" },
  { key: "L", commandId: "nav_cross_column_right" },

  // History
  { key: "[", commandId: "nav_back" },
  { key: "]", commandId: "nav_forward" },

  // Zoom
  { key: "Enter", commandId: "zoom_in", modes: ["normal"] },
  { key: "Backspace", commandId: "zoom_out" },
  { key: "u", commandId: "zoom_out" },

  // === Selection ===
  { key: "v", commandId: "select_toggle" },
  { key: "V", commandId: "select_all_siblings" },
  { key: "a", ctrl: true, commandId: "select_all" },
  { key: "Escape", commandId: "clear_selection" },

  // Extend selection
  { key: "ArrowUp", shift: true, commandId: "extend_select_up" },
  { key: "ArrowDown", shift: true, commandId: "extend_select_down" },
  { key: "ArrowLeft", shift: true, commandId: "extend_select_left" },
  { key: "ArrowRight", shift: true, commandId: "extend_select_right" },

  // === Edit ===
  { key: "m", commandId: "enter_move_mode" },
  { key: "Enter", commandId: "confirm_move", modes: ["move"] },
  { key: "Escape", commandId: "cancel_move", modes: ["move"] },

  // Shifting (Alt+direction)
  { key: "ArrowUp", alt: true, commandId: "shift_up" },
  { key: "ArrowDown", alt: true, commandId: "shift_down" },
  { key: "ArrowLeft", alt: true, commandId: "shift_left" },
  { key: "ArrowRight", alt: true, commandId: "shift_right" },
  { key: "k", alt: true, commandId: "shift_up" },
  { key: "j", alt: true, commandId: "shift_down" },
  { key: "h", alt: true, commandId: "shift_left" },
  { key: "l", alt: true, commandId: "shift_right" },
  { key: "Tab", commandId: "shift_right" },
  { key: "Tab", shift: true, commandId: "shift_left" },

  // === Task ===
  { key: " ", commandId: "cycle_task_status" },
  { key: "x", commandId: "toggle_task_done" },

  // === Fold ===
  // Note: z/Z behavior matches keyboard-handler.ts:
  // - z (lowercase) = fold all cards in column
  // - Z (Shift+z, uppercase) = unfold all cards in column
  // toggle_fold is bound to a different key or not bound by default
  { key: "z", commandId: "fold_all" },
  { key: "Z", commandId: "unfold_all" },
  { key: "c", commandId: "toggle_collapse" },

  // === View ===
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
