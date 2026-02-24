import type { CommandMode, TNode } from "./types.ts"
import type { ResolvedBinding } from "./types.ts"
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
  hasKitty,
  not,
  and,
} from "./when.ts"

export interface Keybinding {
  key: string
  /** If true, matches any key (key field is ignored for matching) */
  wildcard?: boolean
  ctrl?: boolean
  opt?: boolean
  shift?: boolean
  cmd?: boolean
  /** Chord prefix — if set, this binding requires the prefix key first (e.g., chord: "z" + key: "a" = "za") */
  chord?: string
  commandId: string
  /** Destination target for location-aware commands (e.g., "i" for inbox) */
  targetId?: string
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
  /** True when the terminal supports the Kitty keyboard protocol (Cmd key available) */
  hasKitty?: boolean
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
    opt?: boolean
    shift?: boolean
    cmd?: boolean
  },
  ctx: KeybindingContext,
): boolean {
  // Wildcards skip modifier checks — they absorb all keys regardless of modifiers
  if (!binding.wildcard) {
    if (!!binding.ctrl !== !!modifiers.ctrl) return false
    if (!!binding.opt !== !!modifiers.opt) return false
    if (!!binding.cmd !== !!modifiers.cmd) return false
    // For single uppercase letters (A-Z), the shift key is implicit in the character
    // Don't require explicit shift: true in the binding for capital letters
    const isUppercaseLetter = key.length === 1 && key >= "A" && key <= "Z" && !binding.shift
    if (!isUppercaseLetter && !!binding.shift !== !!modifiers.shift) {
      return false
    }
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
    opt?: boolean
    shift?: boolean
    cmd?: boolean
  },
  ctx: KeybindingContext,
): ResolvedBinding | null {
  const bucket = keyMap.get(key) ?? []

  function toResolved(binding: Keybinding): ResolvedBinding {
    return binding.targetId ? { commandId: binding.commandId, targetId: binding.targetId } : { commandId: binding.commandId }
  }

  // Fast path: no wildcards registered
  if (wildcardBindings.length === 0) {
    for (const binding of bucket) {
      if (matchBinding(binding, key, modifiers, ctx)) return toResolved(binding)
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

    if (matchBinding(binding, key, modifiers, ctx)) return toResolved(binding)
  }
  return null
}

/** Check if a key is registered as a chord prefix */
export function isChordPrefix(key: string): boolean {
  return chordPrefixes.has(key)
}

/** Resolve a chord (prefix + second key) to a command + args */
export function resolveChord(
  prefix: string,
  key: string,
  modifiers: {
    ctrl?: boolean
    opt?: boolean
    shift?: boolean
    cmd?: boolean
  },
  ctx: KeybindingContext,
): ResolvedBinding | null {
  const chordKey = `${prefix}:${key}`
  const bucket = chordMap.get(chordKey)
  if (!bucket) return null

  for (const binding of bucket) {
    if (matchBinding(binding, key, modifiers, ctx)) {
      return binding.targetId
        ? { commandId: binding.commandId, targetId: binding.targetId }
        : { commandId: binding.commandId }
    }
  }
  return null
}

/** Get all suffix keys and their command IDs for a given chord prefix */
export function getChordSuffixes(
  prefix: string,
): { key: string; commandId: string; targetId?: string }[] {
  const result: { key: string; commandId: string; targetId?: string }[] = []
  const seen = new Set<string>()
  for (const [chordKey, bucket] of chordMap) {
    if (!chordKey.startsWith(`${prefix}:`)) continue
    const suffixKey = chordKey.slice(prefix.length + 1)
    if (seen.has(suffixKey)) continue
    seen.add(suffixKey)
    // Use the first binding's commandId + targetId (highest priority)
    if (bucket.length > 0) {
      const entry: { key: string; commandId: string; targetId?: string } = {
        key: suffixKey,
        commandId: bucket[0].commandId,
      }
      if (bucket[0].targetId) entry.targetId = bucket[0].targetId
      result.push(entry)
    }
  }
  return result
}

// =============================================================================
// Keybinding Utilities
// =============================================================================

/** Format a keybinding as a human-readable hint string (e.g., "⌘z", "⌃k") */
export function formatKeybinding(binding: Keybinding): string {
  const parts: string[] = []
  if (binding.chord) parts.push(binding.chord)
  if (binding.cmd) parts.push("⌘")
  if (binding.ctrl) parts.push("⌃")
  if (binding.opt) parts.push("⌥")
  if (binding.shift) parts.push("⇧")
  parts.push(binding.key)
  return parts.join("")
}

/** Get all keybindings for a specific command ID */
export function getBindingsForCommand(commandId: string): Keybinding[] {
  const result: Keybinding[] = []
  for (const bucket of keyMap.values()) {
    for (const b of bucket) {
      if (b.commandId === commandId) result.push(b)
    }
  }
  for (const b of wildcardBindings) {
    if (b.commandId === commandId) result.push(b)
  }
  for (const bucket of chordMap.values()) {
    for (const b of bucket) {
      if (b.commandId === commandId) result.push(b)
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
      { key: "k", cmd: true, commandId: "command_palette" },
    ],
  },

  // --- Layer 3: Filter dialog navigation (when filter panel is open) ---
  {
    name: "filter-dialog",
    bindings: [
      { key: "Escape", commandId: "dialog.cancel", when: filterDialogOpen },
      { key: "/", ctrl: true, commandId: "dialog.cancel", when: filterDialogOpen },
      // ⌃g is now a goto chord prefix — no longer cancels filter dialog
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
      { key: "r", cmd: true, commandId: "search_replace.replace", when: searchReplaceOpen },
      { key: "r", ctrl: true, shift: true, commandId: "search_replace.replace_all", when: searchReplaceOpen },
      { key: "r", cmd: true, shift: true, commandId: "search_replace.replace_all", when: searchReplaceOpen },
      { key: "x", ctrl: true, commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
      { key: "x", cmd: true, commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
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
      { key: "z", ctrl: true, commandId: "undo", when: and(isInlineEditing, not(hasKitty)) },
      { key: "z", cmd: true, commandId: "undo", when: isInlineEditing },
      { key: "z", ctrl: true, shift: true, commandId: "redo", when: and(isInlineEditing, not(hasKitty)) },
      { key: "z", cmd: true, shift: true, commandId: "redo", when: isInlineEditing },
      { key: "y", ctrl: true, commandId: "text.yank", when: isInlineEditing },
      // Text formatting (Cmd+b/i — kitty protocol, text edit only)
      { key: "b", cmd: true, commandId: "text.bold", when: isInlineEditing },
      { key: "i", cmd: true, commandId: "text.italic", when: isInlineEditing },
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
      { key: "G", commandId: "filter", when: not(textInputFocused) },
      { key: "F", commandId: "search_replace", when: not(textInputFocused) },

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
      { key: "w", cmd: true, commandId: "close_detail_pane" },
      { key: "Enter", ctrl: true, commandId: "follow_link" },
      { key: "i", ctrl: true, commandId: "toggle_detail_pane" },

      // Ctrl equivalents for chord prefixes and pickers
      { key: "l", ctrl: true, commandId: "add_link", when: not(textInputFocused) },
      // ⌃r freed up (was reparent_picker — now use ⌃m prefix + p/[/+ with Kitty)
      { key: "o", ctrl: true, commandId: "open_in_system", when: not(textInputFocused) },

      // Cmd shortcuts (kitty protocol — macOS native feel)
      // Cmd+i: toggle detail pane (when not inline editing — Cmd+i is italic there)
      { key: "i", cmd: true, commandId: "toggle_detail_pane", when: not(isInlineEditing) },
      // Focus switching: Cmd+h = board, Cmd+l = detail pane
      { key: "h", cmd: true, commandId: "focus_board" },
      { key: "l", cmd: true, commandId: "focus_detail" },
      // History: Cmd+[/] = back/forward
      { key: "[", cmd: true, commandId: "nav_back" },
      { key: "]", cmd: true, commandId: "nav_forward" },
      // Smart open: Cmd+o = system open, Cmd+Shift+o = terminal/editor open
      { key: "o", cmd: true, commandId: "open_in_system" },
      { key: "o", cmd: true, shift: true, commandId: "open_in_terminal" },
    ],
  },

  // --- Layer 8: Selection ---
  {
    name: "selection",
    bindings: [
      // Space = toggle selection (v2 spec)
      { key: " ", commandId: "select_toggle" },
      // Progressive select all with Shift+A
      // A reserved for Agent Dialog
      // Ctrl+A selects all in normal mode (textInputFocused → text.cursor_start is above)
      { key: "a", ctrl: true, commandId: "select_all", when: not(textInputFocused) },
      // Cmd+A selects all (kitty protocol)
      { key: "a", cmd: true, commandId: "select_all" },

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
      { key: "d", commandId: "clipboard_cut", when: not(hasKitty) },
      { key: "Backspace", shift: true, commandId: "clipboard_cut" },
      { key: "Backspace", commandId: "delete_node" },
      { key: "Delete", commandId: "delete_node" },

      // y = copy (yank), p = paste — only without Kitty (conflicts with Kitty key protocol)
      { key: "y", commandId: "clipboard_copy", when: not(hasKitty) },
      { key: "p", commandId: "clipboard_paste", when: not(hasKitty) },

      // o/O = new item below/above (outliner-style)
      { key: "o", commandId: "insert_below" },
      { key: "O", commandId: "insert_above" },
      { key: "Enter", cmd: true, commandId: "insert_below" },
      { key: "Enter", cmd: true, shift: true, commandId: "new_item" },

      // u/U = undo/redo (vim-style)
      { key: "u", commandId: "undo" },
      { key: "U", commandId: "redo" },

      // Shifting (Cmd/Super+direction) — move nodes in tree
      // Also bound to Alt/Meta for terminals without Kitty protocol
      { key: "ArrowUp", cmd: true, commandId: "shift_up" },
      { key: "ArrowDown", cmd: true, commandId: "shift_down" },
      { key: "ArrowLeft", cmd: true, commandId: "shift_left" },
      { key: "ArrowRight", cmd: true, commandId: "shift_right" },
      { key: "k", cmd: true, commandId: "shift_up" },
      { key: "j", cmd: true, commandId: "shift_down" },
      // Note: Cmd+h/l are reserved for focus switching (see navigation layer)
      // Use Alt/Meta+h/l for shifting instead
      { key: "ArrowUp", opt: true, commandId: "shift_up" },
      { key: "ArrowDown", opt: true, commandId: "shift_down" },
      { key: "ArrowLeft", opt: true, commandId: "shift_left" },
      { key: "ArrowRight", opt: true, commandId: "shift_right" },
      { key: "k", opt: true, commandId: "shift_up" },
      { key: "j", opt: true, commandId: "shift_down" },
      { key: "h", opt: true, commandId: "shift_left" },
      { key: "l", opt: true, commandId: "shift_right" },

      // Tab indents (structural: reparent under prev sibling), Shift+Tab outdents
      { key: "Tab", commandId: "indent_node" },
      { key: "Tab", shift: true, commandId: "outdent" },

      // Clipboard (Cmd — macOS; Ctrl fallbacks when Kitty unavailable)
      { key: "c", ctrl: true, commandId: "clipboard_copy", when: and(not(textInputFocused), not(hasKitty)) },
      { key: "x", ctrl: true, commandId: "clipboard_cut", when: and(not(textInputFocused), not(hasKitty)) },
      { key: "v", ctrl: true, commandId: "clipboard_paste", when: and(not(textInputFocused), not(hasKitty)) },
      { key: "c", cmd: true, commandId: "clipboard_copy", when: not(textInputFocused) },
      { key: "x", cmd: true, commandId: "clipboard_cut", when: not(textInputFocused) },
      { key: "v", cmd: true, commandId: "clipboard_paste", when: not(textInputFocused) },
      // Cmd+d = duplicate (kitty)
      { key: "d", cmd: true, commandId: "duplicate_node" },
      // Cmd+n = capture dialog (kitty) — per help spec
      { key: "n", cmd: true, commandId: "capture_dialog" },
    ],
  },

  // --- Layer 10: Task ---
  {
    name: "task",
    bindings: [
      // x = toggle done/not-done (quick), X = cycle through all statuses
      { key: "x", commandId: "toggle_task_done" },
      { key: "X", commandId: "cycle_task_status" },
      // e removed — archive is now m a (move to archive)
      // { key: "e", commandId: "archive" }, // removed: too easy to hit accidentally
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
      { key: "@", commandId: "add", targetId: "pick:@", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "#", commandId: "add", targetId: "pick:#", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "+", commandId: "add", targetId: "pick:+", when: and(not(textInputFocused), not(anyDialogOpen)) },
      { key: "[", commandId: "add", targetId: "pick:[", when: and(not(textInputFocused), not(anyDialogOpen)) },

      // Chord prefix standalone fallbacks (fire on timeout / non-suffix key)
      { key: "g", commandId: "cursor_first" },
      { key: "m", commandId: "enter_move_mode" },
      { key: "a", commandId: "noop" },
      { key: "t", commandId: "noop" },
      { key: "c", commandId: "capture_inbox" },

      // g-prefix chords (go-to)
      { chord: "g", key: "g", commandId: "cursor_first" },
      { chord: "g", key: "G", commandId: "cursor_last" },
      { chord: "g", key: "o", commandId: "open_in_system" },
      { chord: "g", key: "O", commandId: "open_in_terminal" },
      { chord: "g", key: "p", commandId: "goto", targetId: "parent" },
      // Repo locations (composable goto)
      { chord: "g", key: "h", commandId: "goto", targetId: "@next" },
      { chord: "g", key: "i", commandId: "goto", targetId: "@inbox" },
      { chord: "g", key: "j", commandId: "goto", targetId: "@journal" },
      { chord: "g", key: "a", commandId: "goto", targetId: "@archive" },
      // Favorites (composable goto)
      { chord: "g", key: "0", commandId: "goto", targetId: "fav:0" },
      { chord: "g", key: "1", commandId: "goto", targetId: "fav:1" },
      { chord: "g", key: "2", commandId: "goto", targetId: "fav:2" },
      { chord: "g", key: "3", commandId: "goto", targetId: "fav:3" },
      { chord: "g", key: "4", commandId: "goto", targetId: "fav:4" },
      { chord: "g", key: "5", commandId: "goto", targetId: "fav:5" },
      { chord: "g", key: "6", commandId: "goto", targetId: "fav:6" },
      { chord: "g", key: "7", commandId: "goto", targetId: "fav:7" },
      { chord: "g", key: "8", commandId: "goto", targetId: "fav:8" },
      { chord: "g", key: "9", commandId: "goto", targetId: "fav:9" },
      // Pickers (composable goto — opens picker, then navigates to result)
      { chord: "g", key: "+", commandId: "goto", targetId: "pick:+" },
      { chord: "g", key: "[", commandId: "goto", targetId: "pick:[" },
      { chord: "g", key: "#", commandId: "goto", targetId: "pick:#" },
      { chord: "g", key: "@", commandId: "goto", targetId: "pick:@" },

      // v-prefix chords (view operations)
      { chord: "v", key: "c", commandId: "toggle_collapse" },
      { chord: "v", key: "C", commandId: "toggle_show_ignored" },
      { chord: "v", key: "m", commandId: "cycle_view_mode" },
      { chord: "v", key: "d", commandId: "toggle_hide_done" },
      { chord: "v", key: "h", commandId: "ignore_node" },
      { chord: "v", key: "i", commandId: "cycle_icon_style" },
      { chord: "v", key: "-", commandId: "clear_filters" },
      { chord: "v", key: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },

      // m-prefix chords (move)
      { chord: "m", key: "m", commandId: "enter_move_mode" },
      { chord: "m", key: "a", commandId: "archive" },
      // Repo locations (composable move)
      { chord: "m", key: "h", commandId: "move", targetId: "@next" },
      { chord: "m", key: "i", commandId: "move", targetId: "@inbox" },
      { chord: "m", key: "j", commandId: "move", targetId: "@journal" },
      { chord: "m", key: "p", commandId: "move", targetId: "parent" },
      { chord: "m", key: "g", commandId: "move", targetId: "first" },
      { chord: "m", key: "G", commandId: "move", targetId: "last" },
      // Favorites (composable move)
      { chord: "m", key: "0", commandId: "move", targetId: "fav:0" },
      { chord: "m", key: "1", commandId: "move", targetId: "fav:1" },
      { chord: "m", key: "2", commandId: "move", targetId: "fav:2" },
      { chord: "m", key: "3", commandId: "move", targetId: "fav:3" },
      { chord: "m", key: "4", commandId: "move", targetId: "fav:4" },
      { chord: "m", key: "5", commandId: "move", targetId: "fav:5" },
      { chord: "m", key: "6", commandId: "move", targetId: "fav:6" },
      { chord: "m", key: "7", commandId: "move", targetId: "fav:7" },
      { chord: "m", key: "8", commandId: "move", targetId: "fav:8" },
      { chord: "m", key: "9", commandId: "move", targetId: "fav:9" },
      // Pickers (composable move — opens picker, then moves to result)
      { chord: "m", key: "+", commandId: "move", targetId: "pick:+" },
      { chord: "m", key: "[", commandId: "move", targetId: "pick:[" },
      { chord: "m", key: "#", commandId: "move", targetId: "pick:#" },
      { chord: "m", key: "@", commandId: "move", targetId: "pick:@" },

      // a-prefix chords (add/link — composable)
      // Pickers (composable add — opens picker, then adds link to result)
      { chord: "a", key: "#", commandId: "add", targetId: "pick:#" },
      { chord: "a", key: "@", commandId: "add", targetId: "pick:@" },
      { chord: "a", key: "+", commandId: "add", targetId: "pick:+" },
      { chord: "a", key: "[", commandId: "add", targetId: "pick:[" },
      // Repo locations (composable add — link to board)
      { chord: "a", key: "h", commandId: "add", targetId: "@next" },
      { chord: "a", key: "i", commandId: "add", targetId: "@inbox" },
      { chord: "a", key: "j", commandId: "add", targetId: "@journal" },
      // Favorites (composable add)
      { chord: "a", key: "0", commandId: "add", targetId: "fav:0" },
      { chord: "a", key: "1", commandId: "add", targetId: "fav:1" },
      { chord: "a", key: "2", commandId: "add", targetId: "fav:2" },
      { chord: "a", key: "3", commandId: "add", targetId: "fav:3" },
      { chord: "a", key: "4", commandId: "add", targetId: "fav:4" },
      { chord: "a", key: "5", commandId: "add", targetId: "fav:5" },
      { chord: "a", key: "6", commandId: "add", targetId: "fav:6" },
      { chord: "a", key: "7", commandId: "add", targetId: "fav:7" },
      { chord: "a", key: "8", commandId: "add", targetId: "fav:8" },
      { chord: "a", key: "9", commandId: "add", targetId: "fav:9" },

      // t-prefix chords (task properties — v2 spec)
      { chord: "t", key: "t", commandId: "task_dialog" },
      { chord: "t", key: "-", commandId: "clear_task" },
      { chord: "t", key: "o", commandId: "set_assignee" },
      { chord: "t", key: "d", commandId: "set_due_date" },
      { chord: "t", key: "!", commandId: "set_priority" },
      { chord: "t", key: "s", commandId: "set_start_date" },
      { chord: "t", key: "r", commandId: "set_recurring" },
      // toggle_hide_done moved to v d (view prefix)
      { chord: "t", key: "l", commandId: "set_label" },

      // c-prefix chords (capture/create)
      { chord: "c", key: "c", commandId: "capture_dialog" },

      // Ctrl+g chord prefix (alternative for g — goto)
      { chord: "Ctrl+g", key: "g", commandId: "cursor_first" },
      { chord: "Ctrl+g", key: "G", commandId: "cursor_last" },
      { chord: "Ctrl+g", key: "o", commandId: "open_in_system" },
      { chord: "Ctrl+g", key: "O", commandId: "open_in_terminal" },
      { chord: "Ctrl+g", key: "p", commandId: "goto", targetId: "parent" },
      { chord: "Ctrl+g", key: "h", commandId: "goto", targetId: "@next" },
      { chord: "Ctrl+g", key: "i", commandId: "goto", targetId: "@inbox" },
      { chord: "Ctrl+g", key: "j", commandId: "goto", targetId: "@journal" },
      { chord: "Ctrl+g", key: "a", commandId: "goto", targetId: "@archive" },
      { chord: "Ctrl+g", key: "0", commandId: "goto", targetId: "fav:0" },
      { chord: "Ctrl+g", key: "1", commandId: "goto", targetId: "fav:1" },
      { chord: "Ctrl+g", key: "2", commandId: "goto", targetId: "fav:2" },
      { chord: "Ctrl+g", key: "3", commandId: "goto", targetId: "fav:3" },
      { chord: "Ctrl+g", key: "4", commandId: "goto", targetId: "fav:4" },
      { chord: "Ctrl+g", key: "5", commandId: "goto", targetId: "fav:5" },
      { chord: "Ctrl+g", key: "6", commandId: "goto", targetId: "fav:6" },
      { chord: "Ctrl+g", key: "7", commandId: "goto", targetId: "fav:7" },
      { chord: "Ctrl+g", key: "8", commandId: "goto", targetId: "fav:8" },
      { chord: "Ctrl+g", key: "9", commandId: "goto", targetId: "fav:9" },
      { chord: "Ctrl+g", key: "+", commandId: "goto", targetId: "pick:+" },

      // Ctrl+m chord prefix (alternative for m — move, Kitty only since ⌃m = Enter without Kitty)
      { chord: "Ctrl+m", key: "m", commandId: "enter_move_mode", when: hasKitty },
      { chord: "Ctrl+m", key: "a", commandId: "archive", when: hasKitty },
      { chord: "Ctrl+m", key: "h", commandId: "move", targetId: "@next", when: hasKitty },
      { chord: "Ctrl+m", key: "i", commandId: "move", targetId: "@inbox", when: hasKitty },
      { chord: "Ctrl+m", key: "j", commandId: "move", targetId: "@journal", when: hasKitty },
      { chord: "Ctrl+m", key: "p", commandId: "move", targetId: "parent", when: hasKitty },
      { chord: "Ctrl+m", key: "g", commandId: "move", targetId: "first", when: hasKitty },
      { chord: "Ctrl+m", key: "G", commandId: "move", targetId: "last", when: hasKitty },
      { chord: "Ctrl+m", key: "0", commandId: "move", targetId: "fav:0", when: hasKitty },
      { chord: "Ctrl+m", key: "1", commandId: "move", targetId: "fav:1", when: hasKitty },
      { chord: "Ctrl+m", key: "2", commandId: "move", targetId: "fav:2", when: hasKitty },
      { chord: "Ctrl+m", key: "3", commandId: "move", targetId: "fav:3", when: hasKitty },
      { chord: "Ctrl+m", key: "4", commandId: "move", targetId: "fav:4", when: hasKitty },
      { chord: "Ctrl+m", key: "5", commandId: "move", targetId: "fav:5", when: hasKitty },
      { chord: "Ctrl+m", key: "6", commandId: "move", targetId: "fav:6", when: hasKitty },
      { chord: "Ctrl+m", key: "7", commandId: "move", targetId: "fav:7", when: hasKitty },
      { chord: "Ctrl+m", key: "8", commandId: "move", targetId: "fav:8", when: hasKitty },
      { chord: "Ctrl+m", key: "9", commandId: "move", targetId: "fav:9", when: hasKitty },
      { chord: "Ctrl+m", key: "+", commandId: "move", targetId: "pick:+", when: hasKitty },
      { chord: "Ctrl+m", key: "[", commandId: "move", targetId: "pick:[", when: hasKitty },
    ],
  },

  // --- Layer 12: View ---
  {
    name: "view",
    bindings: [
      // v is a chord prefix (v c, v d, v m, etc.) — visual mode via v v chord
      // cycle_icon_style moved to v i (view prefix)
      { key: "?", commandId: "show_help" },
      { key: "+", commandId: "increase_content_lines" },
      { key: "=", commandId: "increase_content_lines" },
      { key: "-", commandId: "decrease_content_lines" },
      { key: "_", commandId: "decrease_content_lines" },
      { key: ",", commandId: "settings" },

      // Filter and command palette
      { key: "/", ctrl: true, commandId: "filter" }, // Replaced by G/Cmd+G in v2 spec — candidate for removal
      { key: ":", commandId: "command_palette" },
    ],
  },

  // --- Layer 13: History (undo/redo via Cmd) ---
  {
    name: "history",
    bindings: [
      { key: "z", ctrl: true, commandId: "undo", when: not(hasKitty) },
      { key: "z", cmd: true, commandId: "undo" },
      { key: "z", ctrl: true, shift: true, commandId: "redo", when: not(hasKitty) },
      { key: "z", cmd: true, shift: true, commandId: "redo" },
      // Ctrl+Y → text.yank in text input, redo otherwise
      { key: "y", ctrl: true, commandId: "text.yank", when: textInputFocused },
    ],
  },

  // --- Layer 14: Pane management (Ctrl+W chord prefix, vim-style) ---
  {
    name: "pane",
    bindings: [
      // Ctrl+W is a chord prefix — second key selects the pane action.
      // Split
      { chord: "Ctrl+w", key: "v", commandId: "pane_split_vertical" },
      { chord: "Ctrl+w", key: "s", commandId: "pane_split_horizontal" },

      // Focus (hjkl)
      { chord: "Ctrl+w", key: "h", commandId: "pane_focus_left" },
      { chord: "Ctrl+w", key: "j", commandId: "pane_focus_down" },
      { chord: "Ctrl+w", key: "k", commandId: "pane_focus_up" },
      { chord: "Ctrl+w", key: "l", commandId: "pane_focus_right" },

      // Resize width (> / <)
      { chord: "Ctrl+w", key: ">", commandId: "pane_resize_grow" },
      { chord: "Ctrl+w", key: "<", commandId: "pane_resize_shrink" },

      // Resize height (+ / -)
      { chord: "Ctrl+w", key: "+", commandId: "pane_resize_grow_vertical" },
      { chord: "Ctrl+w", key: "-", commandId: "pane_resize_shrink_vertical" },

      // Swap (HJKL — uppercase)
      { chord: "Ctrl+w", key: "H", commandId: "pane_swap_left" },
      { chord: "Ctrl+w", key: "J", commandId: "pane_swap_down" },
      { chord: "Ctrl+w", key: "K", commandId: "pane_swap_up" },
      { chord: "Ctrl+w", key: "L", commandId: "pane_swap_right" },

      // Focus toggle/cycle (p / Tab / Shift+Tab / n/N when find inactive)
      { chord: "Ctrl+w", key: "p", commandId: "pane_focus_previous" },
      { chord: "Ctrl+w", key: "Tab", commandId: "pane_focus_next" },
      { chord: "Ctrl+w", key: "Tab", shift: true, commandId: "pane_focus_prev" },
      { key: "n", commandId: "pane_focus_next", when: not(localFindActive) },
      { key: "N", commandId: "pane_focus_prev", when: not(localFindActive) },

      // Close others
      { chord: "Ctrl+w", key: "o", commandId: "pane_only" },

      // Close pane
      { chord: "Ctrl+w", key: "q", commandId: "pane_close" },

      // Zoom (maximize toggle)
      { chord: "Ctrl+w", key: "z", commandId: "pane_zoom" },

      // Equalize
      { chord: "Ctrl+w", key: "=", commandId: "pane_equalize" },
    ],
  },

  // --- Layer 15: TUI-specific ---
  {
    name: "tui",
    bindings: [
      { key: "q", commandId: "quit" },
      { key: "/", commandId: "local_find" },
      { key: "f", cmd: true, commandId: "search_replace" },
      { key: "f", ctrl: true, commandId: "local_find", when: not(textInputFocused) },
      // S and F moved to navigation layer (G = filter, F = find & replace)

      // Cmd shortcuts (kitty protocol — macOS native dialogs & views)
      { key: "t", cmd: true, commandId: "task_dialog" },
      { key: "g", cmd: true, commandId: "filter" },
      { key: "p", cmd: true, commandId: "toggle_detail_pane" },
      { key: ",", cmd: true, commandId: "settings" },

      // Favorites (1-9) — composable goto with target digit
      { key: "1", commandId: "goto", targetId: "fav:1" },
      { key: "2", commandId: "goto", targetId: "fav:2" },
      { key: "3", commandId: "goto", targetId: "fav:3" },
      { key: "4", commandId: "goto", targetId: "fav:4" },
      { key: "5", commandId: "goto", targetId: "fav:5" },
      { key: "6", commandId: "goto", targetId: "fav:6" },
      { key: "7", commandId: "goto", targetId: "fav:7" },
      { key: "8", commandId: "goto", targetId: "fav:8" },
      { key: "9", commandId: "goto", targetId: "fav:9" },

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
