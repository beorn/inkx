import type { CommandMode, TNode } from "./types.ts"
import type { WhenPredicate } from "./when.ts"
import {
  textInputFocused,
  isInDetailPane,
  isInlineEditing,
  searchDialogOpen,
  anyDialogOpen,
  filterDialogOpen,
  helpOverlayOpen,
  deleteConfirmOpen,
  consoleOpen,
  hasActiveToast,
  inVisualMode,
  localFindActive,
  searchReplaceOpen,
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
  /** True when the local find bar is active */
  localFindActive?: boolean
  /** True when the omnibox/command palette is open */
  omniboxOpen?: boolean
  /** True when the search/replace dialog is open */
  searchReplaceOpen?: boolean
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

/** Get all suffix keys and their command IDs for a given chord prefix */
export function getChordSuffixes(prefix: string): { key: string; commandId: string }[] {
  const result: { key: string; commandId: string }[] = []
  const seen = new Set<string>()
  for (const [chordKey, bucket] of chordMap) {
    if (!chordKey.startsWith(`${prefix}:`)) continue
    const suffixKey = chordKey.slice(prefix.length + 1)
    if (seen.has(suffixKey)) continue
    seen.add(suffixKey)
    // Use the first binding's commandId (highest priority)
    if (bucket.length > 0) {
      result.push({ key: suffixKey, commandId: bucket[0].commandId })
    }
  }
  return result
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
      // Help overlay — dismiss with ?, Escape, q; j/k scroll; absorb everything else
      { key: "?", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "Escape", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "q", commandId: "help.dismiss", when: helpOverlayOpen },
      { key: "j", commandId: "help.scroll_down", when: helpOverlayOpen },
      { key: "k", commandId: "help.scroll_up", when: helpOverlayOpen },
      { key: "ArrowDown", commandId: "help.scroll_down", when: helpOverlayOpen },
      { key: "ArrowUp", commandId: "help.scroll_up", when: helpOverlayOpen },
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
      { key: "t", ctrl: true, commandId: "task_dialog" },
      { key: "k", ctrl: true, commandId: "command_palette", when: not(textInputFocused) },
      { key: "k", super: true, commandId: "command_palette" },
    ],
  },

  // --- Layer 3: Filter dialog navigation (when filter panel is open) ---
  {
    name: "filter-dialog",
    bindings: [
      { key: "Escape", commandId: "dialog.cancel", when: filterDialogOpen },
      { key: "/", ctrl: true, commandId: "dialog.cancel", when: filterDialogOpen },
      { key: "g", ctrl: true, commandId: "dialog.cancel", when: filterDialogOpen },
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

  // --- Layer 3b: Search & replace dialog ---
  // When dialog is open: Tab switches fields, Enter finds next, Escape closes.
  // These bindings intercept before the generic dialog layer.
  {
    name: "search-replace",
    bindings: [
      { key: "Escape", commandId: "search_replace.close", when: searchReplaceOpen },
      { key: "Tab", commandId: "search_replace.tab_field", when: searchReplaceOpen },
      { key: "Enter", commandId: "search_replace.next", when: searchReplaceOpen },
      { key: "Enter", shift: true, commandId: "search_replace.prev", when: searchReplaceOpen },
      { key: "r", ctrl: true, commandId: "search_replace.replace", when: searchReplaceOpen },
      { key: "r", super: true, commandId: "search_replace.replace", when: searchReplaceOpen },
      { key: "r", ctrl: true, shift: true, commandId: "search_replace.replace_all", when: searchReplaceOpen },
      { key: "r", super: true, shift: true, commandId: "search_replace.replace_all", when: searchReplaceOpen },
      { key: "x", ctrl: true, commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
      { key: "x", super: true, commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
    ],
  },

  // --- Layer 3c: Local find (inline search bar) ---
  // When find bar input is active: intercept Enter/Escape before generic dialog layer.
  // When find bar is closed but matches exist: n/N navigate matches, Escape clears.
  {
    name: "local-find",
    bindings: [
      // Find bar input active (text input focused): Enter confirms, Escape cancels
      { key: "Escape", commandId: "find_close", when: and(localFindActive, textInputFocused) },
      { key: "Enter", commandId: "find_confirm", when: and(localFindActive, textInputFocused) },
      // Find bar closed but matches remain: n/N navigate, Escape clears
      { key: "n", commandId: "find_next", when: and(localFindActive, not(textInputFocused)) },
      { key: "N", commandId: "find_prev", when: and(localFindActive, not(textInputFocused)) },
      { key: "Escape", commandId: "find_close", when: and(localFindActive, not(textInputFocused)) },
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
      // Text formatting (Cmd+b/i — kitty protocol, text edit only)
      { key: "b", super: true, commandId: "text.bold", when: isInlineEditing },
      { key: "i", super: true, commandId: "text.italic", when: isInlineEditing },
      { key: "*", wildcard: true, commandId: "noop", when: isInlineEditing },
    ],
  },

  // --- Layer 6: Detail pane ---
  {
    name: "detail-pane",
    bindings: [
      // Escape unfocuses pane (returns to board) — pane stays open per v2 spec
      // isInDetailPane = focus tree activeId === "detail-pane", NOT showDetailPane
      { key: "Escape", commandId: "detail_pane.close", when: isInDetailPane },
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

      // Block navigation (J/K — jump by block, auto-unfolds)
      { key: "J", commandId: "block_nav_down" },
      { key: "K", commandId: "block_nav_up" },

      // Arrows behave identically to hjkl
      { key: "ArrowDown", commandId: "cursor_down" },
      { key: "ArrowUp", commandId: "cursor_up" },
      { key: "ArrowLeft", commandId: "cursor_left" },
      { key: "ArrowRight", commandId: "cursor_right" },

      // Emacs-style Ctrl+N/P (normal mode only — dialogs take priority above)
      { key: "n", ctrl: true, commandId: "cursor_down", when: not(anyDialogOpen) },
      { key: "p", ctrl: true, commandId: "cursor_up", when: not(anyDialogOpen) },

      // History navigation: {/} = history back/forward (v2 spec)
      { key: "{", commandId: "nav_back" },
      { key: "}", commandId: "nav_forward" },

      // Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
      { key: "d", ctrl: true, commandId: "page_down" },
      { key: "u", ctrl: true, commandId: "page_up" },
      { key: "PageDown", commandId: "page_down" },
      { key: "PageUp", commandId: "page_up" },

      // Sibling board navigation
      { key: "j", ctrl: true, commandId: "sibling_board_next" },
      { key: "k", ctrl: true, commandId: "sibling_board_prev" },

      // Edit entry: i = edit title at start, Enter = edit title at end
      { key: "i", commandId: "enter_inline_edit", modes: ["normal"] },
      { key: "Enter", commandId: "enter_inline_edit", modes: ["normal"] },

      // Zoom: z = zoom inwards one level, Z = zoom out one level
      { key: "z", commandId: "zoom_inwards" },
      { key: "Z", commandId: "zoom_outwards" },

      // Smart-D: context-aware pane toggle (open+focus / focus / close) per v2 spec
      { key: "D", commandId: "toggle_detail_pane" },
      // Cmd+W: always close detail pane regardless of focus state
      { key: "w", super: true, commandId: "close_detail_pane" },
      { key: "Enter", ctrl: true, commandId: "follow_link" },
      { key: "i", ctrl: true, commandId: "open_detail_pane" },

      // Ctrl equivalents for chord prefixes and pickers
      { key: "l", ctrl: true, commandId: "add_link", when: not(textInputFocused) },
      { key: "r", ctrl: true, commandId: "reparent_picker", when: not(textInputFocused) },
      { key: "o", ctrl: true, commandId: "open_in_system", when: not(textInputFocused) },

      // Cmd shortcuts (kitty protocol — macOS native feel)
      // Focus switching: Cmd+h = board, Cmd+l = detail pane
      { key: "h", super: true, commandId: "focus_board" },
      { key: "l", super: true, commandId: "focus_detail" },
      // History: Cmd+[/] = back/forward
      { key: "[", super: true, commandId: "nav_back" },
      { key: "]", super: true, commandId: "nav_forward" },
      // Smart open: Cmd+o = system open, Cmd+Shift+o = terminal/editor open
      { key: "o", super: true, commandId: "open_in_system" },
      { key: "o", super: true, shift: true, commandId: "open_in_terminal" },
    ],
  },

  // --- Layer 8: Selection ---
  {
    name: "selection",
    bindings: [
      // Space = toggle selection (v2 spec)
      { key: " ", commandId: "select_toggle" },
      // Progressive select all with Shift+A
      { key: "A", commandId: "select_all_progressive" },
      // Ctrl+A selects all in normal mode (textInputFocused → text.cursor_start is above)
      { key: "a", ctrl: true, commandId: "select_all", when: not(textInputFocused) },
      // Cmd+A selects all (kitty protocol)
      { key: "a", super: true, commandId: "select_all" },

      // Extend selection with Shift+arrows (xterm modified arrow sequences)
      { key: "ArrowUp", shift: true, commandId: "extend_select_up" },
      { key: "ArrowDown", shift: true, commandId: "extend_select_down" },
      { key: "ArrowLeft", shift: true, commandId: "extend_select_left" },
      { key: "ArrowRight", shift: true, commandId: "extend_select_right" },
    ],
  },

  // --- Layer 9: Edit ---
  {
    name: "edit",
    bindings: [
      // Move mode
      { key: "Enter", commandId: "confirm_move", modes: ["move"] },
      { key: "Escape", commandId: "cancel_move", modes: ["move"] },

      // I = enter body edit at start, Shift+Enter = enter body edit at end
      { key: "I", commandId: "noop" }, // TODO: enter_body_edit command needs to be created
      { key: "Enter", shift: true, commandId: "noop" }, // TODO: enter_body_edit_end command needs to be created

      // d = cut (forward, cursor → next), Backspace = cut backward (cursor → prev)
      { key: "d", commandId: "clipboard_cut" },
      { key: "Backspace", shift: true, commandId: "clipboard_cut" },
      { key: "Backspace", commandId: "delete_node" },
      { key: "Delete", commandId: "delete_node" },

      // y = copy (yank), p = paste
      { key: "y", commandId: "clipboard_copy" },
      { key: "p", commandId: "clipboard_paste" },

      // o/O = new item below/above (outliner-style)
      { key: "o", commandId: "insert_below" },
      { key: "O", commandId: "insert_above" },
      { key: "Enter", super: true, commandId: "insert_below" },
      { key: "Enter", super: true, shift: true, commandId: "new_item" },

      // u/U = undo/redo (vim-style)
      { key: "u", commandId: "undo" },
      { key: "U", commandId: "redo" },

      // Shifting (Cmd/Super+direction) — move nodes in tree
      // Also bound to Alt/Meta for terminals without Kitty protocol
      { key: "ArrowUp", super: true, commandId: "shift_up" },
      { key: "ArrowDown", super: true, commandId: "shift_down" },
      { key: "ArrowLeft", super: true, commandId: "shift_left" },
      { key: "ArrowRight", super: true, commandId: "shift_right" },
      { key: "k", super: true, commandId: "shift_up" },
      { key: "j", super: true, commandId: "shift_down" },
      // Note: Cmd+h/l are reserved for focus switching (see navigation layer)
      // Use Alt/Meta+h/l for shifting instead
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

      // Clipboard (Ctrl/Cmd)
      { key: "c", ctrl: true, commandId: "clipboard_copy", when: not(textInputFocused) },
      { key: "x", ctrl: true, commandId: "clipboard_cut", when: not(textInputFocused) },
      { key: "v", ctrl: true, commandId: "clipboard_paste", when: not(textInputFocused) },
      { key: "c", super: true, commandId: "clipboard_copy", when: not(textInputFocused) },
      { key: "x", super: true, commandId: "clipboard_cut", when: not(textInputFocused) },
      { key: "v", super: true, commandId: "clipboard_paste", when: not(textInputFocused) },
      // Cmd+d = duplicate (kitty)
      { key: "d", super: true, commandId: "duplicate_node" },
      // Cmd+n = capture new to inbox (kitty)
      { key: "n", super: true, commandId: "capture_inbox" },
    ],
  },

  // --- Layer 10: Task ---
  {
    name: "task",
    bindings: [
      // x = toggle done/not-done (quick), X = cycle through all statuses
      { key: "x", commandId: "toggle_task_done" },
      { key: "X", commandId: "cycle_task_status" },
      // e = archive (remove from view, still searchable)
      { key: "e", commandId: "archive" },
      // c = capture to inbox, C = capture with dialog
      { key: "c", commandId: "capture_inbox" },
      { key: "C", commandId: "capture_dialog" },
    ],
  },

  // --- Layer 11: Fold & chords ---
  {
    name: "fold",
    bindings: [
      // H/L = fold/unfold subtree at cursor (progressive)
      { key: "H", commandId: "fold_node" },
      { key: "L", commandId: "unfold_node" },
      // </> = fold/unfold all (board-wide)
      { key: "<", commandId: "fold_all" },
      { key: ">", commandId: "unfold_all" },

      // Bare symbol shortcuts (convenience aliases for common chord actions)
      // These only fire in node mode (not text edit, not dialog)
      { key: "@", commandId: "add_assignee", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "#", commandId: "add_tag", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "+", commandId: "add_project", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "[", commandId: "add_backlink", when: and(not(textInputFocused), not(anyDialogOpen)) },

      // g/m/a/t standalone fallbacks for chord timeout
      { key: "g", commandId: "cursor_first" },
      { key: "m", commandId: "enter_move_mode" },
      { key: "a", commandId: "noop" },
      { key: "t", commandId: "noop" },

      // g-prefix chords (go-to)
      { chord: "g", key: "g", commandId: "cursor_first" },
      { chord: "g", key: "o", commandId: "open_in_system" },
      { chord: "g", key: "O", commandId: "open_in_terminal" },
      { chord: "g", key: "p", commandId: "project_picker" },
      { chord: "g", key: "n", commandId: "new_item" },
      { chord: "g", key: "i", commandId: "goto_inbox" },
      { chord: "g", key: "j", commandId: "goto_journal" },
      { chord: "g", key: "h", commandId: "goto_home" },
      { chord: "g", key: "e", commandId: "goto_archive" },
      { chord: "g", key: "+", commandId: "project_picker" },
      { chord: "g", key: "[", commandId: "noop" }, // TODO: create goto_node / backlink_picker command
      { chord: "g", key: "#", commandId: "noop" }, // TODO: create goto_tag / tag_picker command

      // v-prefix chords (view operations)
      { chord: "v", key: "c", commandId: "toggle_collapse" },
      { chord: "v", key: "C", commandId: "toggle_show_ignored" },
      { chord: "v", key: "m", commandId: "cycle_view_mode" },
      { chord: "v", key: "d", commandId: "toggle_hide_done" },
      { chord: "v", key: "h", commandId: "ignore_node" },
      { chord: "v", key: "i", commandId: "cycle_icon_style" },
      { chord: "v", key: "-", commandId: "clear_filters" },

      // m-prefix chords (move to board)
      { chord: "m", key: "m", commandId: "enter_move_mode" },
      { chord: "m", key: "i", commandId: "move_to_inbox" },
      { chord: "m", key: "j", commandId: "move_to_journal" },
      { chord: "m", key: "h", commandId: "move_to_home" },
      { chord: "m", key: "p", commandId: "reparent_picker" },
      { chord: "m", key: "+", commandId: "reparent_picker" },
      { chord: "m", key: "[", commandId: "noop" }, // TODO: create move_to_node command
      { chord: "m", key: "#", commandId: "noop" }, // TODO: create move_to_tag command
      { chord: "m", key: "g", commandId: "noop" }, // TODO: create move_to_first command
      { chord: "m", key: "G", commandId: "noop" }, // TODO: create move_to_last command

      // a-prefix chords (add operations — v2 spec)
      { chord: "a", key: "#", commandId: "add_tag" },
      { chord: "a", key: "@", commandId: "add_assignee" },
      { chord: "a", key: "+", commandId: "add_project" },
      { chord: "a", key: "[", commandId: "add_backlink" },
      { chord: "a", key: "i", commandId: "insert_child" },
      { chord: "a", key: "j", commandId: "add_sibling_below" },
      { chord: "a", key: "h", commandId: "insert_at_parent" },

      // t-prefix chords (task properties — v2 spec)
      { chord: "t", key: "t", commandId: "task_dialog" },
      { chord: "t", key: "-", commandId: "noop" }, // TODO: clear_taskness command needs to be created
      { chord: "t", key: "o", commandId: "set_assignee" },
      { chord: "t", key: "d", commandId: "set_due_date" },
      { chord: "t", key: "!", commandId: "set_priority" },
      { chord: "t", key: "s", commandId: "set_start_date" },
      { chord: "t", key: "r", commandId: "set_recurring" },
      // toggle_hide_done moved to v d (view prefix)
      { chord: "t", key: "l", commandId: "set_label" },
    ],
  },

  // --- Layer 12: View ---
  {
    name: "view",
    bindings: [
      { key: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },
      // cycle_icon_style moved to v i (view prefix)
      { key: "?", commandId: "show_help" },
      { key: "+", commandId: "increase_content_lines" },
      { key: "=", commandId: "increase_content_lines" },
      { key: "-", commandId: "decrease_content_lines" },
      { key: "_", commandId: "decrease_content_lines" },
      { key: ",", commandId: "settings" },

      // Filter and command palette
      { key: "/", ctrl: true, commandId: "filter" }, // Replaced by G/Cmd+G in v2 spec — candidate for removal
      { key: "g", ctrl: true, commandId: "filter" },
      { key: ":", commandId: "command_palette" },
    ],
  },

  // --- Layer 13: History (undo/redo via Ctrl/Cmd) ---
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
      { key: "/", commandId: "local_find" },
      { key: "f", super: true, commandId: "search_replace" },
      { key: "f", ctrl: true, commandId: "local_find", when: not(textInputFocused) },
      { key: "S", commandId: "search_replace", when: not(textInputFocused) },
      { key: "F", commandId: "filter", when: not(textInputFocused) },

      // Cmd shortcuts (kitty protocol — macOS native dialogs & views)
      { key: "t", super: true, commandId: "task_dialog" },
      { key: "g", super: true, commandId: "filter" },
      { key: "p", super: true, commandId: "toggle_detail_pane" },
      { key: ",", super: true, commandId: "settings" },

      // Favorites (0-9) — jump to favorite boards
      // 0 is unbound — favorites use 1-9 (no favorite_0 command)
      { key: "1", commandId: "favorite_1" },
      { key: "2", commandId: "favorite_2" },
      { key: "3", commandId: "favorite_3" },
      { key: "4", commandId: "favorite_4" },
      { key: "5", commandId: "favorite_5" },
      { key: "6", commandId: "favorite_6" },
      { key: "7", commandId: "favorite_7" },
      { key: "8", commandId: "favorite_8" },
      { key: "9", commandId: "favorite_9" },

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
