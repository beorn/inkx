import type { CommandMode, TNode } from "./types.ts"
import type { WhenPredicate } from "./when.ts"
import {
  textInputFocused,
  isInDetailPane,
  isInlineEditing,
  searchDialogOpen,
  projectPickerOpen,
  newItemDialogOpen,
  anyDialogOpen,
  filterDialogOpen,
  helpOverlayOpen,
  deleteConfirmOpen,
  consoleOpen,
  hasActiveToast,
  hasMultiSelection,
  inVisualMode,
  not,
  and,
} from "./when.ts"

export interface Keybinding {
  key: string
  /** If true, matches any key (key field is ignored for matching) */
  wildcard?: boolean
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  super?: boolean
  /** Chord prefix — if set, this binding requires the prefix key first (e.g., chord: "z" + key: "a" = "za") */
  chord?: string
  commandId: string
  modes?: CommandMode[]
  when?: WhenPredicate | ((ctx: KeybindingContext) => boolean)
}

export interface KeybindingContext {
  mode: CommandMode
  hasMultiSelection: boolean
  isInDetailPane: boolean
  isInOutlineMode: boolean
  isInlineEditing: boolean
  currentNode: TNode | null
  textInputFocused: boolean
  searchDialogOpen: boolean
  projectPickerOpen: boolean
  newItemDialogOpen: boolean
  datePromptOpen: boolean
  filterDialogOpen: boolean
  helpOverlayOpen: boolean
  deleteConfirmOpen: boolean
  consoleOpen: boolean
  hasActiveToast: boolean
  /** Current input mode from the mode stack (e.g., "command", "insert", "dialog:search"). */
  inputMode?: string
  /** True when in visual mode (vim-style range selection) */
  visualMode?: boolean
}

// Internal binding with registration order for priority interleaving
type OrderedBinding = Keybinding & { _order: number }

// Key-indexed storage for fast lookup
const keyMap = new Map<string, OrderedBinding[]>()
const wildcardBindings: OrderedBinding[] = []
// Chord storage: "z:a" → bindings for chord prefix "z" + key "a"
const chordMap = new Map<string, OrderedBinding[]>()
const chordPrefixes = new Set<string>()
let nextOrder = 0

export function registerKeybinding(binding: Keybinding): void {
  const ordered: OrderedBinding = Object.assign({}, binding, {
    _order: nextOrder++,
  })
  if (binding.chord) {
    // Chord binding: route to chordMap with key "prefix:secondKey"
    const chordKey = `${binding.chord}:${binding.key}`
    const bucket = chordMap.get(chordKey)
    if (bucket) {
      bucket.push(ordered)
    } else {
      chordMap.set(chordKey, [ordered])
    }
    chordPrefixes.add(binding.chord)
  } else if (binding.wildcard) {
    wildcardBindings.push(ordered)
  } else {
    const bucket = keyMap.get(binding.key)
    if (bucket) {
      bucket.push(ordered)
    } else {
      keyMap.set(binding.key, [ordered])
    }
  }
}

export function registerKeybindings(bindings: Keybinding[]): void {
  for (const b of bindings) {
    registerKeybinding(b)
  }
}

export function clearKeybindings(): void {
  keyMap.clear()
  wildcardBindings.length = 0
  chordMap.clear()
  chordPrefixes.clear()
  nextOrder = 0
}

export function getAllKeybindings(): Keybinding[] {
  const result: OrderedBinding[] = []
  for (const bucket of keyMap.values()) {
    result.push(...bucket)
  }
  result.push(...wildcardBindings)
  for (const bucket of chordMap.values()) {
    result.push(...bucket)
  }
  result.sort((a, b) => a._order - b._order)
  // Strip internal _order field from returned bindings
  return result.map(({ _order, ...binding }) => binding)
}

/** Check if a single binding matches the given key, modifiers, and context */
function matchBinding(
  binding: Keybinding,
  key: string,
  modifiers: {
    ctrl?: boolean
    meta?: boolean
    shift?: boolean
    alt?: boolean
    super?: boolean
  },
  ctx: KeybindingContext,
): boolean {
  // Wildcards skip modifier checks — they absorb all keys regardless of modifiers
  if (!binding.wildcard) {
    if (!!binding.ctrl !== !!modifiers.ctrl) return false
    if (!!binding.meta !== !!modifiers.meta) return false
    if (!!binding.super !== !!modifiers.super) return false
    // For single uppercase letters (A-Z), the shift key is implicit in the character
    // Don't require explicit shift: true in the binding for capital letters
    const isUppercaseLetter = key.length === 1 && key >= "A" && key <= "Z" && !binding.shift
    if (!isUppercaseLetter && !!binding.shift !== !!modifiers.shift) {
      return false
    }
    if (!!binding.alt !== !!modifiers.alt) return false
  }

  // Check mode
  if (binding.modes && binding.modes.length > 0) {
    if (!binding.modes.includes(ctx.mode)) return false
  }

  // Check conditional
  if (binding.when && !binding.when(ctx)) return false

  return true
}

export function resolveKeybinding(
  key: string,
  modifiers: {
    ctrl?: boolean
    meta?: boolean
    shift?: boolean
    alt?: boolean
    super?: boolean
  },
  ctx: KeybindingContext,
): string | null {
  const bucket = keyMap.get(key) ?? []

  // Fast path: no wildcards registered
  if (wildcardBindings.length === 0) {
    for (const binding of bucket) {
      if (matchBinding(binding, key, modifiers, ctx)) return binding.commandId
    }
    return null
  }

  // Merge-iterate specific and wildcard bindings in registration order.
  // Both arrays are pre-sorted by _order (insertion order).
  // Wildcards registered early (e.g., modal catch-alls) take priority
  // over specific bindings registered later (e.g., cursor_down).
  let bi = 0
  let wi = 0
  while (bi < bucket.length || wi < wildcardBindings.length) {
    const b = bucket[bi]
    const w = wildcardBindings[wi]

    let binding: OrderedBinding
    if (w === undefined || (b !== undefined && b._order < w._order)) {
      // b is defined: w is undefined OR b._order < w._order (both require b !== undefined)
      binding = b as OrderedBinding
      bi++
    } else {
      binding = w
      wi++
    }

    if (matchBinding(binding, key, modifiers, ctx)) return binding.commandId
  }
  return null
}

/** Check if a key is registered as a chord prefix */
export function isChordPrefix(key: string): boolean {
  return chordPrefixes.has(key)
}

/** Resolve a chord (prefix + second key) to a command ID */
export function resolveChord(
  prefix: string,
  key: string,
  modifiers: {
    ctrl?: boolean
    meta?: boolean
    shift?: boolean
    alt?: boolean
    super?: boolean
  },
  ctx: KeybindingContext,
): string | null {
  const chordKey = `${prefix}:${key}`
  const bucket = chordMap.get(chordKey)
  if (!bucket) return null

  for (const binding of bucket) {
    if (matchBinding(binding, key, modifiers, ctx)) return binding.commandId
  }
  return null
}

// =============================================================================
// Keybinding Layers
// =============================================================================

/** A named group of keybindings, registered in layer order (earlier = higher priority). */
export interface KeybindingLayer {
  /** Layer name for debugging and introspection */
  name: string
  bindings: Keybinding[]
}

/**
 * Default keybinding layers, ordered by priority (highest first).
 * Layers are flattened into a single registration sequence — earlier layers
 * take precedence over later ones for the same key.
 *
 * NOTE: These match docs/06-ui.md Navigation Model
 */
export const defaultKeybindingLayers: KeybindingLayer[] = [
  // --- Layer 1: Blocking modals (absorb ALL keys via wildcards) ---
  {
    name: "modal",
    bindings: [
      // Help overlay — dismiss with ?, Escape, q; absorb everything else
      { key: "?", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "Escape", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "q", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "*", wildcard: true, commandId: "noop", when: helpOverlayOpen },

      // Delete confirmation — Enter confirms, any other key cancels
      { key: "Enter", commandId: "delete_confirm.confirm", when: deleteConfirmOpen },
      { key: "*", wildcard: true, commandId: "delete_confirm.cancel", when: deleteConfirmOpen },

      // Console — Escape/backtick close, q quits, absorb rest
      { key: "Escape", commandId: "console.close", when: consoleOpen },
      { key: "`", commandId: "console.close", when: consoleOpen },
      { key: "q", commandId: "quit", when: consoleOpen },
      { key: "*", wildcard: true, commandId: "noop", when: consoleOpen },

      // Toast dismiss (non-blocking — only intercepts Escape when toast active)
      { key: "Escape", commandId: "toast.dismiss", when: and(hasActiveToast, not(isInlineEditing)) },
    ],
  },

  // --- Layer 2: Global shortcuts (always available) ---
  {
    name: "global",
    bindings: [
      { key: "`", commandId: "console.toggle" },
      { key: "t", ctrl: true, commandId: "dev.test_toast" },
    ],
  },

  // --- Layer 3: Filter dialog navigation (when filter panel is open) ---
  {
    name: "filter-dialog",
    bindings: [
      { key: "Escape", commandId: "dialog.cancel", when: filterDialogOpen },
      { key: "/", ctrl: true, commandId: "dialog.cancel", when: filterDialogOpen },
      { key: "j", commandId: "dialog.nav_down", when: filterDialogOpen },
      { key: "k", commandId: "dialog.nav_up", when: filterDialogOpen },
      { key: "ArrowDown", commandId: "dialog.nav_down", when: filterDialogOpen },
      { key: "ArrowUp", commandId: "dialog.nav_up", when: filterDialogOpen },
      { key: "h", commandId: "filter.nav_left", when: filterDialogOpen },
      { key: "l", commandId: "filter.nav_right", when: filterDialogOpen },
      { key: "ArrowLeft", commandId: "filter.nav_left", when: filterDialogOpen },
      { key: "ArrowRight", commandId: "filter.nav_right", when: filterDialogOpen },
      { key: " ", commandId: "dialog.confirm", when: filterDialogOpen },
      { key: "Enter", commandId: "dialog.confirm", when: filterDialogOpen },
      { key: "X", commandId: "filter.clear_all", when: filterDialogOpen },
    ],
  },

  // --- Layer 4: Dialog navigation (when any text-input dialog is open) ---
  {
    name: "dialog",
    bindings: [
      { key: "Escape", commandId: "dialog.cancel", when: anyDialogOpen },
      { key: "Enter", commandId: "dialog.confirm", when: anyDialogOpen },
      { key: "ArrowUp", commandId: "dialog.nav_up", when: anyDialogOpen },
      { key: "ArrowDown", commandId: "dialog.nav_down", when: anyDialogOpen },
      { key: "p", ctrl: true, commandId: "dialog.nav_up", when: anyDialogOpen },
      { key: "n", ctrl: true, commandId: "dialog.nav_down", when: anyDialogOpen },
      { key: "Tab", commandId: "dialog.toggle_search_scope", when: searchDialogOpen },
    ],
  },

  // --- Layer 4: Block editing (when isInlineEditing) ---
  {
    name: "block-edit",
    bindings: [
      // Up/Down: move text cursor within visual lines, fall through to block navigation at boundaries
      { key: "ArrowUp", commandId: "text.cursor_up", when: isInlineEditing },
      { key: "ArrowDown", commandId: "text.cursor_down", when: isInlineEditing },
    ],
  },

  // --- Layer 5: Text editing (when textInputFocused) ---
  {
    name: "text",
    bindings: [
      { key: "Backspace", commandId: "text.delete_backward", when: textInputFocused },
      { key: "Delete", commandId: "text.delete_forward", when: textInputFocused },
      { key: "ArrowLeft", commandId: "text.cursor_left", when: textInputFocused },
      { key: "ArrowRight", commandId: "text.cursor_right", when: textInputFocused },
      { key: "a", ctrl: true, commandId: "text.cursor_start", when: textInputFocused },
      { key: "e", ctrl: true, commandId: "text.cursor_end", when: textInputFocused },
      { key: "b", ctrl: true, commandId: "text.cursor_left", when: textInputFocused },
      { key: "f", ctrl: true, commandId: "text.cursor_right", when: textInputFocused },
      { key: "w", ctrl: true, commandId: "text.delete_word", when: textInputFocused },
      { key: "u", ctrl: true, commandId: "text.delete_to_start", when: textInputFocused },
      { key: "k", ctrl: true, commandId: "text.delete_to_end", when: textInputFocused },
      // Enter during text input → confirm (save+exit for inline edit, submit for search)
      { key: "Enter", commandId: "text.confirm", when: textInputFocused },
      { key: "Escape", commandId: "text.exit_edit", when: textInputFocused },
    ],
  },

  // --- Layer 5b: Inline editing catch-all ---
  // Undo/redo/yank must be explicitly bound above the wildcard so they still work.
  // The wildcard absorbs all remaining keys during inline editing, preventing
  // node-mode commands (navigation, edit, task, fold, view, quit) from firing.
  // Printable chars never reach here — processInkKey's TEXT_INSERT short-circuit
  // handles them before keybinding resolution.
  {
    name: "inline-edit-barrier",
    bindings: [
      { key: "z", ctrl: true, commandId: "undo", when: isInlineEditing },
      { key: "z", super: true, commandId: "undo", when: isInlineEditing },
      { key: "z", ctrl: true, shift: true, commandId: "redo", when: isInlineEditing },
      { key: "z", super: true, shift: true, commandId: "redo", when: isInlineEditing },
      { key: "y", ctrl: true, commandId: "text.yank", when: isInlineEditing },
      { key: "*", wildcard: true, commandId: "noop", when: isInlineEditing },
    ],
  },

  // --- Layer 6: Detail pane ---
  {
    name: "detail-pane",
    bindings: [
      // Escape closes detail pane (before normal Escape handling)
      // Note: h does NOT have a separate detail_pane.close binding.
      // Instead, cursor_left handles detail pane close contextually in board-actions-nav.ts
      // because in list view showDetailPane=true by default and h must still navigate.
      { key: "Escape", commandId: "detail_pane.close", when: isInDetailPane },
      // Scroll detail pane content with {/} when detail pane is open
      { key: "}", commandId: "detail_pane.scroll_down", when: isInDetailPane },
      { key: "{", commandId: "detail_pane.scroll_up", when: isInDetailPane },
    ],
  },

  // --- Layer 6b: Visual mode (vim-style range selection) ---
  // In visual mode, hjkl extends selection instead of moving cursor.
  // Escape exits visual mode. Must be above navigation to intercept movement keys.
  {
    name: "visual-mode",
    bindings: [
      { key: "Escape", commandId: "visual_mode_exit", when: inVisualMode },
      { key: "j", commandId: "extend_select_down", when: inVisualMode },
      { key: "k", commandId: "extend_select_up", when: inVisualMode },
      { key: "h", commandId: "extend_select_left", when: inVisualMode },
      { key: "l", commandId: "extend_select_right", when: inVisualMode },
      { key: "ArrowDown", commandId: "extend_select_down", when: inVisualMode },
      { key: "ArrowUp", commandId: "extend_select_up", when: inVisualMode },
      { key: "ArrowLeft", commandId: "extend_select_left", when: inVisualMode },
      { key: "ArrowRight", commandId: "extend_select_right", when: inVisualMode },
    ],
  },

  // --- Layer 7: Navigation ---
  {
    name: "navigation",
    bindings: [
      // Visual navigation (j/k/arrows) — document traversal, crosses tree levels
      { key: "j", commandId: "cursor_down" },
      { key: "k", commandId: "cursor_up" },
      { key: "h", commandId: "cursor_left" },
      { key: "l", commandId: "cursor_right" },
      { key: "G", commandId: "cursor_last" },

      // Arrows behave identically to hjkl
      { key: "ArrowDown", commandId: "cursor_down" },
      { key: "ArrowUp", commandId: "cursor_up" },
      { key: "ArrowLeft", commandId: "cursor_left" },
      { key: "ArrowRight", commandId: "cursor_right" },

      // Emacs-style Ctrl+N/P (normal mode only — dialogs take priority above)
      { key: "n", ctrl: true, commandId: "cursor_down", when: not(anyDialogOpen) },
      { key: "p", ctrl: true, commandId: "cursor_up", when: not(anyDialogOpen) },

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
      { key: "Enter", commandId: "enter_inline_edit", modes: ["normal"] },
      { key: "e", commandId: "zoom_in" },
      { key: "o", commandId: "open_in_system" },
      { key: "O", commandId: "open_in_terminal" },
      { key: "i", commandId: "zoom_inwards" },
      { key: "u", commandId: "zoom_outwards" },
      { key: "P", commandId: "follow_link" },
      { key: "Enter", ctrl: true, commandId: "follow_link" },
      { key: "i", ctrl: true, commandId: "open_detail_pane" },

      // Ctrl equivalents for chord prefixes and pickers
      { key: "l", ctrl: true, commandId: "add_link", when: not(textInputFocused) },
      { key: "r", ctrl: true, commandId: "reparent_picker", when: not(textInputFocused) },
    ],
  },

  // --- Layer 8: Selection ---
  {
    name: "selection",
    bindings: [
      // Progressive select all with Shift+A
      { key: "A", commandId: "select_all_progressive" },
      // Ctrl+A selects all in normal mode (textInputFocused → text.cursor_start is above)
      { key: "a", ctrl: true, commandId: "select_all", when: not(textInputFocused) },

      // Extend selection with Shift+movement
      { key: "ArrowUp", shift: true, commandId: "extend_select_up" },
      { key: "ArrowDown", shift: true, commandId: "extend_select_down" },
      { key: "ArrowLeft", shift: true, commandId: "extend_select_left" },
      { key: "ArrowRight", shift: true, commandId: "extend_select_right" },
      { key: "K", commandId: "extend_select_up" },
      { key: "J", commandId: "extend_select_down" },
      { key: "H", commandId: "extend_select_left" },
      { key: "L", commandId: "extend_select_right" },
    ],
  },

  // --- Layer 9: Edit ---
  {
    name: "edit",
    bindings: [
      // m is now a chord prefix (m-prefix chords in fold layer); standalone fallback → enter_move_mode
      { key: "Enter", commandId: "confirm_move", modes: ["move"] },
      { key: "Escape", commandId: "cancel_move", modes: ["move"] },
      // D no longer deletes — only Backspace/Delete
      { key: "Backspace", commandId: "delete_node" },
      { key: "Delete", commandId: "delete_node" },

      // Insert above/below (outliner-style)
      { key: "p", commandId: "insert_above" },
      { key: "n", commandId: "insert_below" },
      { key: "Enter", super: true, commandId: "insert_below" },
      { key: "Enter", super: true, shift: true, commandId: "new_item" },
      { key: "d", commandId: "duplicate_node" },

      // Shifting (Cmd/Super+direction) — move nodes in tree
      // Also bound to Alt/Meta for terminals without Kitty protocol
      { key: "ArrowUp", super: true, commandId: "shift_up" },
      { key: "ArrowDown", super: true, commandId: "shift_down" },
      { key: "ArrowLeft", super: true, commandId: "shift_left" },
      { key: "ArrowRight", super: true, commandId: "shift_right" },
      { key: "k", super: true, commandId: "shift_up" },
      { key: "j", super: true, commandId: "shift_down" },
      { key: "h", super: true, commandId: "shift_left" },
      { key: "l", super: true, commandId: "shift_right" },
      { key: "ArrowUp", meta: true, commandId: "shift_up" },
      { key: "ArrowDown", meta: true, commandId: "shift_down" },
      { key: "ArrowLeft", meta: true, commandId: "shift_left" },
      { key: "ArrowRight", meta: true, commandId: "shift_right" },
      { key: "k", meta: true, commandId: "shift_up" },
      { key: "j", meta: true, commandId: "shift_down" },
      { key: "h", meta: true, commandId: "shift_left" },
      { key: "l", meta: true, commandId: "shift_right" },

      // Tab indents (structural: reparent under prev sibling), Shift+Tab outdents
      { key: "Tab", commandId: "indent_node" },
      { key: "Tab", shift: true, commandId: "outdent" },

      // Clipboard
      { key: "c", ctrl: true, commandId: "clipboard_copy", when: not(textInputFocused) },
      { key: "x", ctrl: true, commandId: "clipboard_cut", when: not(textInputFocused) },
      { key: "v", ctrl: true, commandId: "clipboard_paste", when: not(textInputFocused) },
      { key: "c", super: true, commandId: "clipboard_copy", when: not(textInputFocused) },
      { key: "x", super: true, commandId: "clipboard_cut", when: not(textInputFocused) },
      { key: "v", super: true, commandId: "clipboard_paste", when: not(textInputFocused) },
    ],
  },

  // --- Layer 10: Task ---
  {
    name: "task",
    bindings: [
      { key: "x", commandId: "cycle_task_status" },
      { key: " ", commandId: "toggle_detail_pane" },
    ],
  },

  // --- Layer 11: Fold & chords ---
  {
    name: "fold",
    bindings: [
      // z/Z standalone → fold_all/unfold_all (preserved behavior, also chord fallback)
      { key: "z", commandId: "fold_all" },
      { key: "Z", commandId: "unfold_all" },
      { key: "c", commandId: "toggle_collapse" },
      { key: "C", commandId: "ignore_node" },

      // g/m/t/s standalone fallbacks for chord timeout
      { key: "g", commandId: "cursor_first" },
      { key: "m", commandId: "enter_move_mode" },
      { key: "t", commandId: "set_due_date" },
      { key: "s", commandId: "set_priority" },

      // z-prefix chords (vim fold)
      { chord: "z", key: "a", commandId: "toggle_fold" },
      { chord: "z", key: "o", commandId: "unfold_node" },
      { chord: "z", key: "c", commandId: "fold_node" },
      { chord: "z", key: "O", commandId: "unfold_recursive" },
      { chord: "z", key: "M", commandId: "fold_all" },
      { chord: "z", key: "R", commandId: "unfold_all" },

      // g-prefix chords (go-to)
      { chord: "g", key: "g", commandId: "cursor_first" },
      { chord: "g", key: "p", commandId: "project_picker" },
      { chord: "g", key: "n", commandId: "new_item" },
      { chord: "g", key: "C", commandId: "toggle_show_ignored" },
      { chord: "g", key: "i", commandId: "goto_inbox" },
      { chord: "g", key: "j", commandId: "goto_journal" },
      { chord: "g", key: "h", commandId: "goto_home" },
      { chord: "g", key: "e", commandId: "goto_next" },

      // m-prefix chords (move to board)
      { chord: "m", key: "m", commandId: "enter_move_mode" },
      { chord: "m", key: "i", commandId: "move_to_inbox" },
      { chord: "m", key: "j", commandId: "move_to_journal" },
      { chord: "m", key: "e", commandId: "move_to_next" },

      // t-prefix chords (time/date stubs)
      { chord: "t", key: "d", commandId: "set_due_date" },
      { chord: "t", key: "r", commandId: "set_recurring" },
      { chord: "t", key: "s", commandId: "set_start_date" },

      // s-prefix chords (set property stubs)
      { chord: "s", key: "p", commandId: "set_priority" },
      { chord: "s", key: "l", commandId: "set_label" },
      { chord: "s", key: "a", commandId: "set_assignee" },
      { chord: "s", key: "r", commandId: "rename_node" },
    ],
  },

  // --- Layer 12: View ---
  {
    name: "view",
    bindings: [
      { key: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },
      { key: "V", commandId: "cycle_icon_style" },
      { key: "?", commandId: "show_help" },
      { key: "<", commandId: "decrease_outline_depth" },
      { key: ">", commandId: "increase_outline_depth" },
      { key: "+", commandId: "increase_content_lines" },
      { key: "=", commandId: "increase_content_lines" },
      { key: "-", commandId: "decrease_content_lines" },
      { key: "_", commandId: "decrease_content_lines" },

      // Filter and command palette
      { key: "/", ctrl: true, commandId: "filter" },
      { key: "D", commandId: "toggle_hide_done" },
      { key: "\\", commandId: "command_palette" },
    ],
  },

  // --- Layer 13: History (undo/redo) ---
  {
    name: "history",
    bindings: [
      { key: "z", ctrl: true, commandId: "undo" },
      { key: "z", super: true, commandId: "undo" },
      { key: "z", ctrl: true, shift: true, commandId: "redo" },
      { key: "z", super: true, shift: true, commandId: "redo" },
      // Ctrl+Y → text.yank in text input, redo otherwise
      { key: "y", ctrl: true, commandId: "text.yank", when: textInputFocused },
      { key: "y", ctrl: true, commandId: "redo", when: not(textInputFocused) },
    ],
  },

  // --- Layer 14: TUI-specific ---
  {
    name: "tui",
    bindings: [
      { key: "q", commandId: "quit" },
      { key: "/", commandId: "search" },
      { key: "f", super: true, commandId: "search" },

      // Favorites (1-9) — jump to favorite boards
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
    ],
  },
]

/** Flat array of all default keybindings (layers flattened in priority order). */
export const defaultKeybindings: Keybinding[] = defaultKeybindingLayers.flatMap((layer) => layer.bindings)

// Initialize with defaults
export function initDefaultKeybindings(): void {
  clearKeybindings()
  registerKeybindings(defaultKeybindings)
}
