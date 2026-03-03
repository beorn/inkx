import type { CommandMode, TNode, CommandContext, CommandAction } from "./types.ts"
import type { ResolvedBinding } from "./types.ts"
import type { WhenPredicate } from "./when.ts"
import {
  textInputFocused,
  isInDetailPane,
  isInlineEditing,
  searchDialogOpen,
  anyDialogOpen,
  filterDialogOpen,
  favoritesDialogOpen,
  favoritesAddMode,
  helpOverlayOpen,
  deleteConfirmOpen,
  consoleOpen,
  hasActiveToast,
  inVisualMode,
  localFindActive,
  searchReplaceOpen,
  inputTypeField,
  hasKitty,
  not,
  and,
} from "./when.ts"
import { verbLocationGrid, ctrlVerbLocationGrid } from "./verb-locations.ts"
import { getAllFavorites } from "./favorites.ts"

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
  /** Direct execute function — bypasses command registry when set (verb x location grid) */
  execute?: (ctx: CommandContext) => CommandAction | CommandAction[] | null
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
  itemPickerOpen: boolean
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
  /** True when the favorites dialog is open */
  favoritesDialogOpen?: boolean
  /** True when favorites dialog is in "add" mode (capturing a key) */
  favoritesAddMode?: boolean
  /** True when the terminal supports the Kitty keyboard protocol (Cmd key available) */
  hasKitty?: boolean
  /** Active input type: "field" for single-line inputs, "textarea" for multi-line (inline edit) */
  inputType?: "field" | "textarea"
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
    const result: ResolvedBinding = { commandId: binding.commandId }
    if (binding.targetId) result.targetId = binding.targetId
    if (binding.execute) result.execute = binding.execute
    return result
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

  // Mask out modifiers that are part of the chord prefix so holding
  // the prefix modifier through the second key still works.
  // E.g., "Ctrl+w q" matches even if user holds Ctrl while pressing q.
  const masked = { ...modifiers }
  if (prefix.includes("Ctrl")) masked.ctrl = false
  if (prefix.includes("Alt")) masked.opt = false
  if (prefix.includes("Shift")) masked.shift = false

  for (const binding of bucket) {
    if (matchBinding(binding, key, masked, ctx)) {
      const result: ResolvedBinding = { commandId: binding.commandId }
      if (binding.targetId) result.targetId = binding.targetId
      if (binding.execute) result.execute = binding.execute
      return result
    }
  }
  return null
}

/** Get all suffix keys and their command IDs for a given chord prefix */
export function getChordSuffixes(prefix: string): { key: string; commandId: string; targetId?: string }[] {
  const result: { key: string; commandId: string; targetId?: string }[] = []
  const seen = new Set<string>()
  for (const [chordKey, bucket] of chordMap) {
    if (!chordKey.startsWith(`${prefix}:`)) continue
    const suffixKey = chordKey.slice(prefix.length + 1)
    if (seen.has(suffixKey)) continue
    seen.add(suffixKey)
    // Use the first binding's commandId + targetId (highest priority)
    const first = bucket[0]
    if (first) {
      const entry: { key: string; commandId: string; targetId?: string } = {
        key: suffixKey,
        commandId: first.commandId,
      }
      if (first.targetId) entry.targetId = first.targetId
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

  // --- Layer 3a: Favorites dialog (manage key→node mappings) ---
  {
    name: "favorites-dialog",
    bindings: [
      // Add mode: capture the pressed key or cancel
      { key: "Escape", commandId: "favorites.cancel_assign", when: and(favoritesDialogOpen, favoritesAddMode) },
      { key: "*", wildcard: true, commandId: "favorites.assign", when: and(favoritesDialogOpen, favoritesAddMode) },
      // Normal mode: navigate, add, clear, close
      { key: "Escape", commandId: "dialog.cancel", when: favoritesDialogOpen },
      { key: "a", commandId: "favorites.start_assign", when: favoritesDialogOpen },
      { key: "j", commandId: "dialog.nav_down", when: favoritesDialogOpen },
      { key: "k", commandId: "dialog.nav_up", when: favoritesDialogOpen },
      { key: "ArrowDown", commandId: "dialog.nav_down", when: favoritesDialogOpen },
      { key: "ArrowUp", commandId: "dialog.nav_up", when: favoritesDialogOpen },
      { key: "x", commandId: "favorites.clear", when: favoritesDialogOpen },
      { key: "X", commandId: "favorites.clear", when: favoritesDialogOpen },
    ],
  },

  // --- Layer 3b: Search & replace dialog ---
  // When dialog is open: Tab switches fields, Enter finds next, Escape closes.
  // These bindings intercept before the generic dialog layer.
  {
    name: "search-replace",
    bindings: [
      { key: "Escape", commandId: "search_replace.close", when: searchReplaceOpen },
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
      // Exclude isInlineEditing so text.exit_edit takes priority (km-tui.double-esc)
      { key: "Escape", commandId: "find_close", when: and(localFindActive, textInputFocused, not(isInlineEditing)) },
      { key: "Enter", commandId: "find_confirm", when: and(localFindActive, textInputFocused) },
      { key: "n", ctrl: true, commandId: "find_next", when: and(localFindActive, textInputFocused) },
      { key: "p", ctrl: true, commandId: "find_prev", when: and(localFindActive, textInputFocused) },
      // Find bar closed but matches remain: n/N navigate, Escape clears
      // Exclude isInlineEditing so text.exit_edit takes priority (km-tui.double-esc)
      { key: "n", commandId: "find_next", when: and(localFindActive, not(textInputFocused)) },
      { key: "N", commandId: "find_prev", when: and(localFindActive, not(textInputFocused)) },
      {
        key: "Escape",
        commandId: "find_close",
        when: and(localFindActive, not(textInputFocused), not(isInlineEditing)),
      },
    ],
  },

  // --- Layer 3d: Tab routing by input type ---
  // When a text input is focused in field mode (dialogs), Tab cycles focus.
  // When no inputType is active, Tab falls through to Layer 9 indent_node.
  {
    name: "input-type-tab",
    bindings: [
      { key: "Tab", commandId: "focus_next", when: and(inputTypeField, not(searchDialogOpen)) },
      { key: "Tab", shift: true, commandId: "focus_prev", when: and(inputTypeField, not(searchDialogOpen)) },
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
      { key: "f", ctrl: true, commandId: "text.cursor_right", when: and(textInputFocused, hasKitty) },
      { key: "f", ctrl: true, commandId: "local_find", when: and(textInputFocused, not(hasKitty)) },
      { key: "w", ctrl: true, commandId: "text.delete_word", when: textInputFocused },
      { key: "u", ctrl: true, commandId: "text.delete_to_start", when: textInputFocused },
      { key: "k", ctrl: true, commandId: "text.delete_to_end", when: and(textInputFocused, hasKitty) },
      { key: "k", ctrl: true, commandId: "command_palette", when: and(textInputFocused, not(hasKitty)) },
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
  // Navigation (j/k/h/J/K/gg/G) falls through to standard navigation layer.
  // CURSOR_MOVE and ZOOM_IN handlers detect detail mode and dispatch accordingly.
  // Enter = edit (same as board), not zoom — detail pane shows properties inline.
  {
    name: "detail-pane",
    bindings: [
      { key: "Enter", commandId: "enter_inline_edit", when: isInDetailPane },
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
      { key: "G", commandId: "cursor_last", when: not(textInputFocused) },
      { key: "T", commandId: "task_dialog", when: not(textInputFocused) },
      { key: "M", commandId: "manage_favorites", when: not(textInputFocused) },
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
      { key: "I", commandId: "enter_body_edit" },
      { key: "Enter", shift: true, commandId: "enter_body_edit" },

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

      // g-prefix chords (go-to — non-location entries)
      { chord: "g", key: "g", commandId: "cursor_first" },
      { chord: "g", key: "G", commandId: "cursor_last" },
      { chord: "g", key: "o", commandId: "open_in_system" },
      { chord: "g", key: "O", commandId: "open_in_terminal" },

      // v-prefix chords — VIEW operations
      { chord: "v", key: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },
      { chord: "v", key: "m", commandId: "cycle_view_mode" },
      { chord: "v", key: "i", commandId: "cycle_icon_style" },
      { chord: "v", key: "c", commandId: "toggle_collapse" },
      { chord: "v", key: "X", commandId: "toggle_show_ignored" },
      { chord: "v", key: "d", commandId: "toggle_hide_done" },
      { chord: "v", key: "x", commandId: "ignore_node" },
      { chord: "v", key: "-", commandId: "clear_filters" },
      { chord: "v", key: ",", commandId: "filter" },

      // v-prefix chords — PANE operations
      { chord: "v", key: "s", commandId: "pane_split_vertical" },
      { chord: "v", key: "h", commandId: "pane_focus_left" },
      { chord: "v", key: "j", commandId: "pane_focus_down" },
      { chord: "v", key: "k", commandId: "pane_focus_up" },
      { chord: "v", key: "l", commandId: "pane_focus_right" },
      { chord: "v", key: ">", commandId: "pane_resize_grow" },
      { chord: "v", key: "<", commandId: "pane_resize_shrink" },
      { chord: "v", key: "=", commandId: "pane_equalize" },
      { chord: "v", key: "H", commandId: "pane_swap_left" },
      { chord: "v", key: "J", commandId: "pane_swap_down" },
      { chord: "v", key: "K", commandId: "pane_swap_up" },
      { chord: "v", key: "L", commandId: "pane_swap_right" },
      { chord: "v", key: "n", commandId: "pane_focus_next" },
      { chord: "v", key: "N", commandId: "pane_focus_prev" },
      { chord: "v", key: "p", commandId: "pane_focus_previous" },
      { chord: "v", key: "Tab", commandId: "pane_focus_next" },
      { chord: "v", key: "Tab", shift: true, commandId: "pane_focus_prev" },
      { chord: "v", key: "w", commandId: "pane_close" },
      { chord: "v", key: "o", commandId: "pane_only" },
      { chord: "v", key: "z", commandId: "pane_zoom" },

      // m-prefix chords (move — non-location entries)
      { chord: "m", key: "m", commandId: "enter_move_mode" },
      { chord: "m", key: "a", commandId: "archive" },

      // t-prefix chords (task properties — v2 spec)
      { chord: "t", key: "t", commandId: "task_dialog" },
      { chord: "t", key: "-", commandId: "clear_task" },
      { chord: "t", key: "o", commandId: "set_assignee" },
      { chord: "t", key: "d", commandId: "set_due_date" },
      { chord: "t", key: "!", commandId: "set_priority" },
      { chord: "t", key: "0", commandId: "set_priority_0" },
      { chord: "t", key: "1", commandId: "set_priority_1" },
      { chord: "t", key: "2", commandId: "set_priority_2" },
      { chord: "t", key: "3", commandId: "set_priority_3" },
      { chord: "t", key: "4", commandId: "set_priority_4" },
      { chord: "t", key: "s", commandId: "cycle_task_status" },
      { chord: "t", key: "r", commandId: "set_recurring" },
      // toggle_hide_done moved to v d (view prefix)
      { chord: "t", key: "l", commandId: "set_label" },

      // Verb x location grid (composable chords: g/m/a/c x locations)
      ...verbLocationGrid(),

      // Ctrl+g/Ctrl+m non-location entries
      { chord: "Ctrl+g", key: "g", commandId: "cursor_first" },
      { chord: "Ctrl+g", key: "G", commandId: "cursor_last" },
      { chord: "Ctrl+g", key: "o", commandId: "open_in_system" },
      { chord: "Ctrl+g", key: "O", commandId: "open_in_terminal" },
      { chord: "Ctrl+m", key: "m", commandId: "enter_move_mode", when: hasKitty },
      { chord: "Ctrl+m", key: "a", commandId: "archive", when: hasKitty },

      // Ctrl+prefix verb x location grid (Kitty terminal alternatives)
      ...ctrlVerbLocationGrid(),
    ],
  },

  // --- Layer 12: View ---
  {
    name: "view",
    bindings: [
      // v is a chord prefix (v c, v d, v m, etc.) — visual mode via v v chord
      // V (uppercase) = view settings (opens filter dialog)
      { key: "V", commandId: "filter" },
      { key: "?", commandId: "show_help" },
      { key: ".", commandId: "increase_content_lines" },
      { key: "=", commandId: "increase_content_lines" },
      { key: ",", commandId: "decrease_content_lines" },
      { key: "-", commandId: "decrease_content_lines" },

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

  // --- Layer 14: Ctrl+V chord prefix (alternative for v — view & pane) ---
  {
    name: "ctrl-v",
    bindings: [
      // View operations (mirrors v-prefix)
      { chord: "Ctrl+v", key: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },
      { chord: "Ctrl+v", key: "m", commandId: "cycle_view_mode" },
      { chord: "Ctrl+v", key: "i", commandId: "cycle_icon_style" },
      { chord: "Ctrl+v", key: "c", commandId: "toggle_collapse" },
      { chord: "Ctrl+v", key: "X", commandId: "toggle_show_ignored" },
      { chord: "Ctrl+v", key: "d", commandId: "toggle_hide_done" },
      { chord: "Ctrl+v", key: "x", commandId: "ignore_node" },
      { chord: "Ctrl+v", key: "-", commandId: "clear_filters" },
      { chord: "Ctrl+v", key: ",", commandId: "filter" },
      // Pane operations (mirrors v-prefix)
      { chord: "Ctrl+v", key: "s", commandId: "pane_split_vertical" },
      { chord: "Ctrl+v", key: "h", commandId: "pane_focus_left" },
      { chord: "Ctrl+v", key: "j", commandId: "pane_focus_down" },
      { chord: "Ctrl+v", key: "k", commandId: "pane_focus_up" },
      { chord: "Ctrl+v", key: "l", commandId: "pane_focus_right" },
      { chord: "Ctrl+v", key: ">", commandId: "pane_resize_grow" },
      { chord: "Ctrl+v", key: "<", commandId: "pane_resize_shrink" },
      { chord: "Ctrl+v", key: "=", commandId: "pane_equalize" },
      { chord: "Ctrl+v", key: "H", commandId: "pane_swap_left" },
      { chord: "Ctrl+v", key: "J", commandId: "pane_swap_down" },
      { chord: "Ctrl+v", key: "K", commandId: "pane_swap_up" },
      { chord: "Ctrl+v", key: "L", commandId: "pane_swap_right" },
      { chord: "Ctrl+v", key: "n", commandId: "pane_focus_next" },
      { chord: "Ctrl+v", key: "N", commandId: "pane_focus_prev" },
      { chord: "Ctrl+v", key: "p", commandId: "pane_focus_previous" },
      { chord: "Ctrl+v", key: "Tab", commandId: "pane_focus_next" },
      { chord: "Ctrl+v", key: "w", commandId: "pane_close" },
      { chord: "Ctrl+v", key: "o", commandId: "pane_only" },
      { chord: "Ctrl+v", key: "z", commandId: "pane_zoom" },

      // Bare n/N for pane cycling (when find is not active)
      { key: "n", commandId: "pane_focus_next", when: not(localFindActive) },
      { key: "N", commandId: "pane_focus_prev", when: not(localFindActive) },
    ],
  },

  // --- Layer 15: TUI-specific ---
  {
    name: "tui",
    bindings: [
      { key: "q", commandId: "quit" },
      { key: "/", commandId: "local_find" },
      { key: "f", cmd: true, commandId: "local_find" },
      { key: "f", cmd: true, shift: true, commandId: "search_replace" },
      // S and F moved to navigation layer (G = filter, F = find & replace)

      // Cmd shortcuts (kitty protocol — macOS native dialogs & views)
      { key: "t", cmd: true, commandId: "task_dialog" },
      { key: "g", cmd: true, commandId: "filter" },
      { key: "p", cmd: true, commandId: "toggle_detail_pane" },
      { key: ",", cmd: true, commandId: "settings" },

      // Favorites — dynamic bindings from favorites registry
      ...Array.from(getAllFavorites().keys()).map((key) => ({
        key,
        commandId: "goto",
        targetId: `fav:${key}`,
      })),

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
