import type { CommandMode, TNode, CommandContext, KmOp } from "./types.ts"
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
  favoritesKeySelected,
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

/**
 * Architecture note: This flat keybinding system uses `when` guards to simulate
 * focus-based key routing. Silvery's useInputLayer provides the proper cascade
 * model (child-first bubbling, return true to consume / false to pass). The
 * migration to useInputLayer is tracked by km-silvery.tea.migration (era2).
 * Until then, `when` guards like `not(textInputFocused)` are the workaround.
 */

export interface Keybinding {
  /**
   * Key string encoding modifiers and chords:
   * - Simple: "j", "Enter", "Escape"
   * - Modifiers: "ctrl-t", "cmd-shift-z", "opt-ArrowUp"
   * - Chord: "v c", "g g", "t d" (space-separated: prefix then suffix)
   * - Chord + modifiers: "Ctrl+v c", "Ctrl+g ctrl-f"
   */
  key: string
  /** If true, matches any key (key field is ignored for matching) */
  wildcard?: boolean
  commandId: string
  /** Destination target for location-aware commands (e.g., "i" for inbox) */
  targetId?: string
  /** Direct execute function — bypasses command registry when set (verb x location grid) */
  execute?: (ctx: CommandContext) => KmOp | KmOp[] | null
  modes?: CommandMode[]
  when?: WhenPredicate | ((ctx: KeybindingContext) => boolean)
}

// =============================================================================
// Key String Parsing
// =============================================================================

/** Parsed representation of a key string — used internally for fast matching */
export interface ParsedKey {
  /** The actual key character/name (e.g., "t", "ArrowUp", "Enter") */
  key: string
  ctrl: boolean
  opt: boolean
  shift: boolean
  cmd: boolean
  /** Chord prefix — if the key string is space-separated (e.g., "v c" → chord: "v") */
  chord?: string
}

/** Maps modifier name variants to ParsedKey boolean fields */
const MODIFIERS: Record<string, keyof Pick<ParsedKey, "ctrl" | "opt" | "shift" | "cmd">> = {
  ctrl: "ctrl",
  control: "ctrl",
  opt: "opt",
  alt: "opt",
  shift: "shift",
  cmd: "cmd",
  meta: "cmd",
}

/**
 * Parse a compact key string into its components.
 *
 * Examples:
 * - "j" → { key: "j", ctrl: false, ... }
 * - "ctrl-t" → { key: "t", ctrl: true, ... }
 * - "cmd-shift-z" → { key: "z", cmd: true, shift: true, ... }
 * - "v c" → { chord: "v", key: "c", ... }
 * - "Ctrl+g o" → { chord: "Ctrl+g", key: "o", ... }
 * - "v shift-Tab" → { chord: "v", key: "Tab", shift: true, ... }
 */
export function parseKeyString(keyStr: string): ParsedKey {
  // Handle chord: "v c" → { chord: "v", key: "c", ... }
  // Chord prefix is everything before the first space
  const spaceIdx = keyStr.indexOf(" ")
  if (spaceIdx > 0) {
    const prefix = keyStr.slice(0, spaceIdx)
    const suffix = keyStr.slice(spaceIdx + 1)
    // Parse suffix for modifiers (e.g., "v shift-Tab")
    const parsed = parseKeyString(suffix)
    return { ...parsed, chord: prefix }
  }

  // Handle modifier prefixes: "ctrl-t", "cmd-shift-k"
  // Special case: bare "-" is a literal hyphen key, not a separator
  if (keyStr === "-") {
    return { key: "-", ctrl: false, opt: false, shift: false, cmd: false }
  }

  const parts = keyStr.split("-")
  const result: ParsedKey = { key: "", ctrl: false, opt: false, shift: false, cmd: false }

  for (const part of parts) {
    const mod = MODIFIERS[part.toLowerCase()]
    if (mod) result[mod] = true
    else result.key = part // Last non-modifier part is the key
  }

  return result
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
  /** True when a key is selected in the favorites detail view */
  favoritesKeySelected?: boolean
  /** True when the terminal supports the Kitty keyboard protocol (Cmd key available) */
  hasKitty?: boolean
  /** Active input type: "field" for single-line inputs, "textarea" for multi-line (inline edit) */
  inputType?: "field" | "textarea"
  /** Index of the block being edited (0 = title, 1+ = body) */
  editBlockIndex?: number
  /** True when cursor is at position 0 and content is non-empty */
  cursorAtStart(): boolean
  /** True when cursor is at or past end of content */
  cursorAtEnd(): boolean
  /** True when the edited node has visible (unfolded) structural children */
  hasVisibleChildren(): boolean
  /** Visual role of the edited node in the board layout */
  editDepth(): "board" | "column" | "card"
}

// Internal binding with registration order and pre-parsed key data for fast matching
type OrderedBinding = Keybinding & { _order: number; _parsed: ParsedKey }

// Key-indexed storage for fast lookup
const keyMap = new Map<string, OrderedBinding[]>()
const wildcardBindings: OrderedBinding[] = []
// Chord storage: "z:a" → bindings for chord prefix "z" + key "a"
const chordMap = new Map<string, OrderedBinding[]>()
const chordPrefixes = new Set<string>()
let nextOrder = 0

export function registerKeybinding(binding: Keybinding): void {
  const parsed = parseKeyString(binding.key)
  const ordered: OrderedBinding = Object.assign({}, binding, {
    _order: nextOrder++,
    _parsed: parsed,
  })
  if (parsed.chord) {
    // Chord binding: route to chordMap with key "prefix:secondKey"
    const chordKey = `${parsed.chord}:${parsed.key}`
    const bucket = chordMap.get(chordKey)
    if (bucket) {
      bucket.push(ordered)
    } else {
      chordMap.set(chordKey, [ordered])
    }
    chordPrefixes.add(parsed.chord)
  } else if (binding.wildcard) {
    wildcardBindings.push(ordered)
  } else {
    const bucket = keyMap.get(parsed.key)
    if (bucket) {
      bucket.push(ordered)
    } else {
      keyMap.set(parsed.key, [ordered])
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
  // Strip internal fields from returned bindings
  return result.map(({ _order, _parsed, ...binding }) => binding)
}

/** Check if a single binding matches the given key, modifiers, and context */
function matchBinding(
  binding: OrderedBinding,
  key: string,
  modifiers: {
    ctrl?: boolean
    opt?: boolean
    shift?: boolean
    cmd?: boolean
  },
  ctx: KeybindingContext,
): boolean {
  const parsed = binding._parsed
  // Wildcards skip modifier checks — they absorb all keys regardless of modifiers
  if (!binding.wildcard) {
    if (!!parsed.ctrl !== !!modifiers.ctrl) return false
    if (!!parsed.opt !== !!modifiers.opt) return false
    if (!!parsed.cmd !== !!modifiers.cmd) return false
    if (!!parsed.shift !== !!modifiers.shift) return false
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
    // Use the first binding's parsed data to reconstruct the full suffix key
    const first = bucket[0]
    if (!first) continue
    // Reconstruct suffix with modifiers (e.g., shift-g, shift-Tab)
    const parsed = first._parsed
    const parts: string[] = []
    if (parsed.ctrl) parts.push("ctrl")
    if (parsed.opt) parts.push("opt")
    if (parsed.shift) parts.push("shift")
    if (parsed.cmd) parts.push("cmd")
    parts.push(parsed.key)
    const suffixKey = parts.join("-")
    if (seen.has(suffixKey)) continue
    seen.add(suffixKey)
    const entry: { key: string; commandId: string; targetId?: string } = {
      key: suffixKey,
      commandId: first.commandId,
    }
    if (first.targetId) entry.targetId = first.targetId
    result.push(entry)
  }
  return result
}

// =============================================================================
// Keybinding Utilities
// =============================================================================

/** Format a keybinding as a human-readable hint string (e.g., "⌘z", "⌃k") */
export function formatKeybinding(binding: Keybinding): string {
  const parsed = parseKeyString(binding.key)
  const parts: string[] = []
  if (parsed.chord) parts.push(parsed.chord)
  if (parsed.cmd) parts.push("⌘")
  if (parsed.ctrl) parts.push("⌃")
  if (parsed.opt) parts.push("⌥")
  if (parsed.shift) parts.push("⇧")
  parts.push(parsed.key)
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

/** v/Ctrl+v chord suffixes — shared between v-prefix and Ctrl+v layers */
const V_CHORD_SUFFIXES: Array<{ suffix: string; commandId: string; when?: WhenPredicate }> = [
  { suffix: "v", commandId: "visual_mode_enter", when: not(inVisualMode) },
  { suffix: "m", commandId: "cycle_view_mode" },
  // View operations
  { suffix: "c", commandId: "toggle_collapse" },
  { suffix: "shift-x", commandId: "toggle_show_hidden" },
  { suffix: "d", commandId: "toggle_hide_done" },
  { suffix: "x", commandId: "hide_node" },
  { suffix: "-", commandId: "clear_filters" },
  { suffix: ",", commandId: "filter" },
  // Pane operations
  { suffix: "s", commandId: "pane_split_vertical" },
  { suffix: "h", commandId: "pane_focus_left" },
  { suffix: "j", commandId: "pane_focus_down" },
  { suffix: "k", commandId: "pane_focus_up" },
  { suffix: "l", commandId: "pane_focus_right" },
  { suffix: "shift-.", commandId: "pane_resize_grow" },
  { suffix: "shift-,", commandId: "pane_resize_shrink" },
  { suffix: "=", commandId: "pane_equalize" },
  { suffix: "shift-h", commandId: "pane_swap_left" },
  { suffix: "shift-j", commandId: "pane_swap_down" },
  { suffix: "shift-k", commandId: "pane_swap_up" },
  { suffix: "shift-l", commandId: "pane_swap_right" },
  { suffix: "n", commandId: "pane_focus_next" },
  { suffix: "shift-n", commandId: "pane_focus_prev" },
  { suffix: "p", commandId: "pane_focus_previous" },
  { suffix: "Tab", commandId: "pane_focus_next" },
  { suffix: "w", commandId: "pane_close" },
  { suffix: "o", commandId: "pane_only" },
  { suffix: "z", commandId: "pane_zoom" },
]

/** Generate keybindings from shared chord suffix definitions with a key prefix */
function prefixChords(prefix: string, suffixes: typeof V_CHORD_SUFFIXES): Keybinding[] {
  return suffixes.map(({ suffix, commandId, when }) => ({
    key: `${prefix} ${suffix}`,
    commandId,
    ...(when && { when }),
  }))
}

/** Inline editing Enter predicates */
const editingTitle = (ctx: KeybindingContext) => ctx.isInlineEditing && (ctx.editBlockIndex ?? 0) === 0
const editingBody = (ctx: KeybindingContext) => ctx.isInlineEditing && (ctx.editBlockIndex ?? 0) > 0

/**
 * Default keybinding layers, ordered by priority (highest first).
 * Layers are flattened into a single registration sequence — earlier layers
 * take precedence over later ones for the same key.
 *
 * NOTE: These match docs/06-ui.md Navigation Model
 */
export function defaultKeybindingLayers(): KeybindingLayer[] {
  return [
    // --- Layer 1: Blocking modals (absorb ALL keys via wildcards) ---
    {
      name: "modal",
      bindings: [
        // Help overlay — dismiss with ?, Escape, q; j/k scroll; absorb everything else
        { key: "shift-/", commandId: "help.dismiss", when: helpOverlayOpen }, // ?
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

        // Console — Escape/backtick/q close console, absorb rest.
        // q closes the console (not quit) — a bare `q` must never kill the session.
        // See bead km-tui.q-quits-no-confirm.
        { key: "Escape", commandId: "console.close", when: consoleOpen },
        { key: "`", commandId: "console.close", when: consoleOpen },
        { key: "q", commandId: "console.close", when: consoleOpen },
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
        { key: "ctrl-t", commandId: "task_dialog" },
        { key: "ctrl-k", commandId: "command_palette", when: not(textInputFocused) },
        { key: "cmd-k", commandId: "command_palette" },
      ],
    },

    // --- Layer 3: Filter dialog navigation (when filter panel is open) ---
    {
      name: "filter-dialog",
      bindings: [
        { key: "Escape", commandId: "dialog.cancel", when: filterDialogOpen },
        { key: "ctrl-/", commandId: "dialog.cancel", when: filterDialogOpen },
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
        { key: "shift-x", commandId: "filter.clear_all", when: filterDialogOpen },
      ],
    },

    // --- Layer 3a: Favorites dialog (manage key→node mappings) ---
    {
      name: "favorites-dialog",
      bindings: [
        // Detail view (key selected): Enter assigns, Delete/Backspace clears, Escape goes back
        { key: "Enter", commandId: "favorites.assign", when: and(favoritesDialogOpen, favoritesKeySelected) },
        { key: "Delete", commandId: "favorites.clear", when: and(favoritesDialogOpen, favoritesKeySelected) },
        { key: "Backspace", commandId: "favorites.clear", when: and(favoritesDialogOpen, favoritesKeySelected) },
        { key: "Escape", commandId: "favorites.back", when: and(favoritesDialogOpen, favoritesKeySelected) },
        // List view: Escape closes, any key selects it
        { key: "Escape", commandId: "dialog.cancel", when: favoritesDialogOpen },
        { key: "*", wildcard: true, commandId: "favorites.select_key", when: favoritesDialogOpen },
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
        { key: "shift-Enter", commandId: "search_replace.prev", when: searchReplaceOpen },
        { key: "ctrl-r", commandId: "search_replace.replace", when: searchReplaceOpen },
        { key: "cmd-r", commandId: "search_replace.replace", when: searchReplaceOpen },
        { key: "ctrl-shift-r", commandId: "search_replace.replace_all", when: searchReplaceOpen },
        { key: "cmd-shift-r", commandId: "search_replace.replace_all", when: searchReplaceOpen },
        { key: "ctrl-x", commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
        { key: "cmd-x", commandId: "search_replace.toggle_regex", when: searchReplaceOpen },
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
        { key: "ctrl-n", commandId: "find_next", when: and(localFindActive, textInputFocused) },
        { key: "ctrl-p", commandId: "find_prev", when: and(localFindActive, textInputFocused) },
        // Find bar closed but matches remain: n/N navigate, Escape clears
        // Exclude isInlineEditing so text.exit_edit takes priority (km-tui.double-esc)
        { key: "n", commandId: "find_next", when: and(localFindActive, not(textInputFocused)) },
        { key: "shift-n", commandId: "find_prev", when: and(localFindActive, not(textInputFocused)) },
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
        { key: "shift-Tab", commandId: "focus_prev", when: and(inputTypeField, not(searchDialogOpen)) },
      ],
    },

    // --- Layer 4a: Dialog navigation (when any text-input dialog is open) ---
    {
      name: "dialog",
      bindings: [
        { key: "Escape", commandId: "dialog.cancel", when: anyDialogOpen },
        { key: "Enter", commandId: "dialog.confirm", when: anyDialogOpen },
        { key: "ArrowUp", commandId: "dialog.nav_up", when: anyDialogOpen },
        { key: "ArrowDown", commandId: "dialog.nav_down", when: anyDialogOpen },
        { key: "ctrl-p", commandId: "dialog.nav_up", when: anyDialogOpen },
        { key: "ctrl-n", commandId: "dialog.nav_down", when: anyDialogOpen },
        { key: "Tab", commandId: "dialog.toggle_search_scope", when: searchDialogOpen },
      ],
    },

    // --- Layer 4b: Block editing (when isInlineEditing) ---
    {
      name: "block-edit",
      bindings: [
        // Up/Down: navigate within text, then to adjacent block at boundary
        { key: "ArrowUp", commandId: "text.cursor_up", when: isInlineEditing },
        { key: "ArrowDown", commandId: "text.cursor_down", when: isInlineEditing },
        // Ctrl-P/N: navigate to adjacent block while staying in edit mode
        { key: "ctrl-p", commandId: "edit_block.navigate_up", when: isInlineEditing },
        { key: "ctrl-n", commandId: "edit_block.navigate_down", when: isInlineEditing },
      ],
    },

    // --- Layer 5: Text editing (when textInputFocused) ---
    {
      name: "text",
      bindings: [
        { key: "Backspace", commandId: "text.delete_backward", when: textInputFocused },
        { key: "Delete", commandId: "text.delete_forward", when: textInputFocused },
        { key: "ctrl-d", commandId: "text.delete_forward", when: textInputFocused },
        { key: "ArrowLeft", commandId: "text.cursor_left", when: textInputFocused },
        { key: "ArrowRight", commandId: "text.cursor_right", when: textInputFocused },
        { key: "ctrl-a", commandId: "text.cursor_start", when: textInputFocused },
        { key: "ctrl-e", commandId: "text.cursor_end", when: textInputFocused },
        { key: "ctrl-b", commandId: "text.cursor_left", when: textInputFocused },
        { key: "ctrl-f", commandId: "text.cursor_right", when: and(textInputFocused, hasKitty) },
        { key: "ctrl-f", commandId: "local_find", when: and(textInputFocused, not(hasKitty)) },
        { key: "ctrl-w", commandId: "text.delete_word", when: textInputFocused },
        { key: "ctrl-u", commandId: "text.delete_to_start", when: textInputFocused },
        { key: "ctrl-k", commandId: "text.delete_to_end", when: and(textInputFocused, hasKitty) },
        { key: "ctrl-k", commandId: "command_palette", when: and(textInputFocused, not(hasKitty)) },

        // Enter — inline edit: cursor-position-aware behavior
        // Title: start → insert before, middle → split, end → child or sibling
        // At end: outline nodes (board/column titles) ALWAYS create child (= visually "down"),
        // other nodes create child only if they have visible children, else sibling.
        { key: "Enter", commandId: "text.linebreak_before", when: (ctx) => editingTitle(ctx) && ctx.cursorAtStart() },
        {
          key: "Enter",
          commandId: "text.linebreak_split",
          when: (ctx) => editingTitle(ctx) && !ctx.cursorAtStart() && !ctx.cursorAtEnd(),
        },
        {
          key: "Enter",
          commandId: "text.linebreak_child",
          when: (ctx) =>
            editingTitle(ctx) && ctx.cursorAtEnd() && (ctx.hasVisibleChildren() || ctx.editDepth() !== "card"),
        },
        {
          key: "Enter",
          commandId: "text.linebreak_after",
          when: (ctx) =>
            editingTitle(ctx) && ctx.cursorAtEnd() && !ctx.hasVisibleChildren() && ctx.editDepth() === "card",
        },
        // Body block → split paragraph
        { key: "Enter", commandId: "text.linebreak_split", when: editingBody },
        // Detail pane → save and exit
        { key: "Enter", commandId: "text.confirm", when: (ctx) => ctx.isInlineEditing && ctx.isInDetailPane },
        // Dialog/search text input → confirm
        { key: "Enter", commandId: "text.confirm", when: (ctx) => ctx.textInputFocused && !ctx.isInlineEditing },
        // Shift+Enter — always insert child
        { key: "shift-Enter", commandId: "text.child_block", when: (ctx) => ctx.isInlineEditing },

        { key: "Escape", commandId: "text.exit_edit", when: textInputFocused },
      ],
    },

    // --- Layer 5b: Inline editing catch-all ---
    // Undo/redo/yank must be explicitly bound above the wildcard so they still work.
    // The wildcard absorbs all remaining keys during inline editing, preventing
    // node-mode commands (navigation, edit, task, fold, view, quit) from firing.
    // Printable chars never reach here — processKey's TEXT_INSERT short-circuit
    // handles them before keybinding resolution.
    {
      name: "inline-edit-barrier",
      bindings: [
        { key: "ctrl-z", commandId: "undo", when: and(isInlineEditing, not(hasKitty)) },
        { key: "cmd-z", commandId: "undo", when: isInlineEditing },
        { key: "ctrl-shift-z", commandId: "redo", when: and(isInlineEditing, not(hasKitty)) },
        { key: "cmd-shift-z", commandId: "redo", when: isInlineEditing },
        { key: "ctrl-y", commandId: "text.yank", when: isInlineEditing },
        // Text formatting (Cmd+b/i — kitty protocol, text edit only)
        { key: "cmd-b", commandId: "text.bold", when: isInlineEditing },
        { key: "cmd-i", commandId: "text.italic", when: isInlineEditing },
        // Cmd shortcuts that must punch through the inline-edit barrier
        { key: "cmd-f", commandId: "local_find", when: isInlineEditing },
        { key: "cmd-shift-f", commandId: "search_replace", when: isInlineEditing },
        { key: "cmd-d", commandId: "duplicate_node", when: isInlineEditing },
        { key: "cmd-n", commandId: "capture_dialog", when: isInlineEditing },
        { key: "cmd-Enter", commandId: "insert_below", when: isInlineEditing },
        { key: "cmd-shift-Enter", commandId: "new_item", when: isInlineEditing },
        // Tab/Shift+Tab indent/outdent — structural operations that should work during inline edit
        { key: "Tab", commandId: "indent_node", when: isInlineEditing },
        { key: "shift-Tab", commandId: "outdent", when: isInlineEditing },
        { key: "*", wildcard: true, commandId: "noop", when: isInlineEditing },
      ],
    },

    // --- Layer 6: Detail pane ---
    // Navigation (j/k/h/J/K/gg/G) falls through to standard navigation layer.
    // CURSOR_MOVE and ZOOM_IN handlers detect detail mode and dispatch accordingly.
    // Enter = edit (same as board), not zoom — detail pane shows properties inline.
    {
      name: "detail-pane",
      bindings: [{ key: "Enter", commandId: "enter_inline_edit", when: isInDetailPane }],
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
        { key: "shift-g", commandId: "cursor_last", when: not(textInputFocused) },
        { key: "shift-t", commandId: "task_dialog", when: not(textInputFocused) },
        { key: "shift-m", commandId: "manage_favorites", when: not(textInputFocused) },
        { key: "shift-f", commandId: "search_replace", when: not(textInputFocused) },

        // Block navigation (J/K — jump by block, auto-unfolds)
        { key: "shift-j", commandId: "block_nav_down" },
        { key: "shift-k", commandId: "block_nav_up" },

        // Arrows behave identically to hjkl
        { key: "ArrowDown", commandId: "cursor_down" },
        { key: "ArrowUp", commandId: "cursor_up" },
        { key: "ArrowLeft", commandId: "cursor_left" },
        { key: "ArrowRight", commandId: "cursor_right" },

        // Emacs-style Ctrl+N/P → spatial block nav (same as Shift+J/K)
        // Dialog layer (4a) handles ctrl-n/p when dialog is open — no guard needed here
        { key: "ctrl-n", commandId: "block_nav_down" },
        { key: "ctrl-p", commandId: "block_nav_up" },

        // History navigation: {/} = history back/forward (v2 spec)
        { key: "shift-[", commandId: "nav_back" }, // {
        { key: "shift-]", commandId: "nav_forward" }, // }

        // Page-based cursor jump (vim Ctrl+D/Ctrl+U style)
        { key: "ctrl-d", commandId: "page_down", when: not(textInputFocused) },
        { key: "ctrl-u", commandId: "page_up", when: not(textInputFocused) },
        { key: "PageDown", commandId: "page_down" },
        { key: "PageUp", commandId: "page_up" },

        // Sibling board navigation
        { key: "ctrl-j", commandId: "sibling_board_next" },
        { key: "ctrl-k", commandId: "sibling_board_prev" },

        // Edit entry: i = edit title at start, Enter = edit title at end
        { key: "i", commandId: "enter_inline_edit", modes: ["normal"] },
        // Note: no column-level Enter binding needed — when cursor is at column,
        // !ctx.isAtCardLevel is true, and the card-level Enter handler below
        // dispatches ENTER_INLINE_EDIT with the column nodeId via the same logic
        { key: "Enter", commandId: "enter_inline_edit", modes: ["normal"] },

        // Zoom: z = zoom inwards one level, Z = zoom out one level
        { key: "z", commandId: "zoom_inwards" },
        { key: "shift-z", commandId: "zoom_outwards" },

        // Smart-D: context-aware pane toggle (open+focus / focus / close) per v2 spec
        { key: "shift-d", commandId: "toggle_detail_pane" },
        // Cmd+W: always close detail pane regardless of focus state
        { key: "cmd-w", commandId: "close_detail_pane" },
        { key: "ctrl-Enter", commandId: "follow_link" },
        { key: "ctrl-i", commandId: "toggle_detail_pane" },

        // Ctrl equivalents for chord prefixes and pickers
        { key: "ctrl-l", commandId: "add_link", when: not(textInputFocused) },
        // ⌃r freed up (was reparent_picker — now use ⌃m prefix + p/[/+ with Kitty)
        { key: "ctrl-o", commandId: "open_in_system", when: not(textInputFocused) },

        // Cmd shortcuts (kitty protocol — macOS native feel)
        // Cmd+i: toggle detail pane (when not inline editing — Cmd+i is italic there)
        { key: "cmd-i", commandId: "toggle_detail_pane", when: not(isInlineEditing) },
        // Focus switching: Cmd+h = board, Cmd+l = detail pane
        { key: "cmd-h", commandId: "focus_board" },
        { key: "cmd-l", commandId: "focus_detail" },
        // History: Cmd+[/] = back/forward
        { key: "cmd-[", commandId: "nav_back" },
        { key: "cmd-]", commandId: "nav_forward" },
        // Smart open: Cmd+o = system open, Cmd+Shift+o = terminal/editor open
        { key: "cmd-o", commandId: "open_in_system" },
        { key: "cmd-shift-o", commandId: "open_in_terminal" },
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
        { key: "ctrl-a", commandId: "select_all", when: not(textInputFocused) },
        // Cmd+A selects all (kitty protocol)
        { key: "cmd-a", commandId: "select_all" },

        // Extend selection with Shift+arrows (xterm modified arrow sequences)
        { key: "shift-ArrowUp", commandId: "extend_select_up" },
        { key: "shift-ArrowDown", commandId: "extend_select_down" },
        { key: "shift-ArrowLeft", commandId: "extend_select_left" },
        { key: "shift-ArrowRight", commandId: "extend_select_right" },
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
        { key: "shift-i", commandId: "enter_body_edit", when: not(textInputFocused) },
        { key: "shift-Enter", commandId: "enter_body_edit", when: not(textInputFocused) },

        // d = cut (forward, cursor → next), Backspace = cut backward (cursor → prev)
        { key: "d", commandId: "clipboard_cut", when: and(not(hasKitty), not(textInputFocused)) },
        { key: "shift-Backspace", commandId: "clipboard_cut", when: not(textInputFocused) },
        { key: "Backspace", commandId: "delete_node", when: not(textInputFocused) },
        { key: "Delete", commandId: "delete_node", when: not(textInputFocused) },

        // y = copy (yank), p = paste — only without Kitty (conflicts with Kitty key protocol)
        { key: "y", commandId: "clipboard_copy", when: not(hasKitty) },
        { key: "p", commandId: "clipboard_paste", when: not(hasKitty) },

        // o/O = new item below/above (outliner-style)
        { key: "o", commandId: "insert_below", when: not(textInputFocused) },
        { key: "shift-o", commandId: "insert_above", when: not(textInputFocused) },
        { key: "cmd-Enter", commandId: "insert_below" },
        { key: "cmd-shift-Enter", commandId: "new_item" },

        // u/U = undo/redo (vim-style)
        { key: "u", commandId: "undo", when: not(textInputFocused) },
        { key: "shift-u", commandId: "redo", when: not(textInputFocused) },

        // Cmd+arrows — NOT usable: Ghostty/iTerm consume them
        // (Up/Down = scroll, Left = Home/Ctrl+E, Right = End/Ctrl+A)
        // Cmd+[ / ] already used for nav_back/forward (navigation layer)
        // Fold/unfold: use H/L (Shift+h/l)
        // Shifting (Opt+direction) — move nodes in tree
        { key: "opt-ArrowUp", commandId: "shift_up" },
        { key: "opt-ArrowDown", commandId: "shift_down" },
        { key: "opt-ArrowLeft", commandId: "shift_left" },
        { key: "opt-ArrowRight", commandId: "shift_right" },
        { key: "opt-k", commandId: "shift_up" },
        { key: "opt-j", commandId: "shift_down" },
        { key: "opt-h", commandId: "shift_left" },
        { key: "opt-l", commandId: "shift_right" },

        // Tab indents (structural: reparent under prev sibling), Shift+Tab outdents
        { key: "Tab", commandId: "indent_node", when: not(textInputFocused) },
        { key: "shift-Tab", commandId: "outdent", when: not(textInputFocused) },

        // Clipboard (Cmd — macOS; Ctrl fallbacks when Kitty unavailable)
        { key: "ctrl-c", commandId: "clipboard_copy", when: and(not(textInputFocused), not(hasKitty)) },
        { key: "ctrl-x", commandId: "clipboard_cut", when: and(not(textInputFocused), not(hasKitty)) },
        { key: "ctrl-v", commandId: "clipboard_paste", when: and(not(textInputFocused), not(hasKitty)) },
        { key: "cmd-c", commandId: "clipboard_copy", when: not(textInputFocused) },
        { key: "cmd-x", commandId: "clipboard_cut", when: not(textInputFocused) },
        { key: "cmd-v", commandId: "clipboard_paste", when: not(textInputFocused) },
        // Cmd+d = duplicate (kitty)
        { key: "cmd-d", commandId: "duplicate_node" },
        // Cmd+n = capture dialog (kitty) — per help spec
        { key: "cmd-n", commandId: "capture_dialog" },
      ],
    },

    // --- Layer 10: Task ---
    {
      name: "task",
      bindings: [
        // x = toggle done/not-done (quick), X = cycle through all statuses
        { key: "x", commandId: "toggle_task_done" },
        { key: "shift-x", commandId: "cycle_task_status" },
        // e removed — archive is now m a (move to archive)
        // { key: "e", commandId: "archive" }, // removed: too easy to hit accidentally
        // c = capture to inbox, C = capture with dialog
        { key: "c", commandId: "capture_inbox" },
        { key: "shift-c", commandId: "capture_dialog" },
      ],
    },

    // --- Layer 11: Fold & chords ---
    {
      name: "fold",
      bindings: [
        // H/L = fold/unfold subtree at cursor (progressive)
        { key: "shift-h", commandId: "fold_more" },
        { key: "shift-l", commandId: "unfold_more" },
        // </> = fold/unfold all (board-wide)
        { key: "shift-,", commandId: "fold_all_more" }, // <
        { key: "shift-.", commandId: "unfold_all_more" }, // >

        // Bare symbol shortcuts (convenience aliases for common chord actions)
        // These only fire in node mode (not text edit, not dialog)
        { key: "shift-2", commandId: "add", targetId: "pick:@", when: and(not(textInputFocused), not(anyDialogOpen)) }, // @
        { key: "shift-3", commandId: "add", targetId: "pick:#", when: and(not(textInputFocused), not(anyDialogOpen)) }, // #
        { key: "shift-=", commandId: "add", targetId: "pick:+", when: and(not(textInputFocused), not(anyDialogOpen)) }, // +
        { key: "[", commandId: "add", targetId: "pick:[", when: and(not(textInputFocused), not(anyDialogOpen)) },

        // Chord prefix standalone fallbacks (fire on timeout / non-suffix key)
        { key: "g", commandId: "cursor_first" },
        { key: "m", commandId: "enter_move_mode" },
        { key: "a", commandId: "noop" },
        { key: "t", commandId: "noop" },
        { key: "c", commandId: "capture_inbox" },

        // g-prefix chords (go-to — non-location entries)
        { key: "g g", commandId: "cursor_first" },
        { key: "g shift-g", commandId: "cursor_last" },
        { key: "g o", commandId: "open_in_system" },
        { key: "g shift-o", commandId: "open_in_terminal" },
        { key: "g f", commandId: "follow_wikilink" },

        // v-prefix chords — VIEW + PANE operations (generated from shared V_CHORD_SUFFIXES)
        ...prefixChords("v", V_CHORD_SUFFIXES),
        { key: "v shift-Tab", commandId: "pane_focus_prev" },

        // m-prefix chords (move — non-location entries)
        { key: "m m", commandId: "enter_move_mode" },
        { key: "m a", commandId: "archive" },

        // t-prefix chords (task properties — v2 spec)
        { key: "t t", commandId: "task_dialog" },
        { key: "t -", commandId: "clear_task" },
        { key: "t o", commandId: "set_assignee" },
        { key: "t d", commandId: "set_due_date" },
        { key: "t shift-1", commandId: "set_priority" }, // t !
        { key: "t 0", commandId: "set_priority_0" },
        { key: "t 1", commandId: "set_priority_1" },
        { key: "t 2", commandId: "set_priority_2" },
        { key: "t 3", commandId: "set_priority_3" },
        { key: "t 4", commandId: "set_priority_4" },
        { key: "t s", commandId: "cycle_task_status" },
        { key: "t r", commandId: "set_recurring" },
        // toggle_hide_done moved to v d (view prefix)
        { key: "t l", commandId: "set_label" },

        // Verb x location grid (composable chords: g/m/a/c x locations)
        ...verbLocationGrid(),

        // Ctrl+g/Ctrl+m non-location entries
        { key: "Ctrl+g g", commandId: "cursor_first" },
        { key: "Ctrl+g shift-g", commandId: "cursor_last" },
        { key: "Ctrl+g o", commandId: "open_in_system" },
        { key: "Ctrl+g shift-o", commandId: "open_in_terminal" },
        { key: "Ctrl+g f", commandId: "follow_wikilink" },
        { key: "Ctrl+m m", commandId: "enter_move_mode", when: hasKitty },
        { key: "Ctrl+m a", commandId: "archive", when: hasKitty },

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
        { key: "shift-v", commandId: "filter" },
        { key: "shift-/", commandId: "show_help" }, // ?
        { key: ".", commandId: "increase_content_lines" },
        { key: "=", commandId: "increase_content_lines" },
        { key: ",", commandId: "decrease_content_lines" },
        { key: "-", commandId: "decrease_content_lines" },

        // Filter and command palette

        { key: "shift-;", commandId: "command_palette" }, // :
      ],
    },

    // --- Layer 13: History (undo/redo via Cmd) ---
    {
      name: "history",
      bindings: [
        { key: "ctrl-z", commandId: "undo", when: not(hasKitty) },
        { key: "cmd-z", commandId: "undo" },
        { key: "ctrl-shift-z", commandId: "redo", when: not(hasKitty) },
        { key: "cmd-shift-z", commandId: "redo" },
        // Ctrl+Y → text.yank in text input, redo otherwise
        { key: "ctrl-y", commandId: "text.yank", when: textInputFocused },
      ],
    },

    // --- Layer 14: Ctrl+V chord prefix (alternative for v — view & pane) ---
    {
      name: "ctrl-v",
      bindings: [
        // Mirrors v-prefix (generated from shared V_CHORD_SUFFIXES)
        ...prefixChords("Ctrl+v", V_CHORD_SUFFIXES),
        // Bare n/N for pane cycling (when find is not active)
        { key: "n", commandId: "pane_focus_next", when: not(localFindActive) },
        { key: "shift-n", commandId: "pane_focus_prev", when: not(localFindActive) },
      ],
    },

    // --- Layer 15: TUI-specific ---
    {
      name: "tui",
      bindings: [
        // Bare `q` → quit is intentionally UNBOUND. Quit requires the `q q`
        // chord — press q twice in sequence within the chord timeout. A single
        // fat-finger keystroke must never destroy the session (especially after
        // an incomplete chord like `vq` where the user meant `vs`). Quit is
        // also available via Ctrl+C, the command palette (Ctrl+K / Cmd+K / `:`)
        // as the "quit" command, or contextual Escape (`close_or_quit`) when
        // there is nothing left to close. See bead km-tui.q-quits-no-confirm.
        { key: "q q", commandId: "quit" },
        { key: "/", commandId: "local_find" },
        { key: "cmd-f", commandId: "local_find" },
        { key: "cmd-shift-f", commandId: "search_replace" },
        // S and F moved to navigation layer (G = filter, F = find & replace)

        // Cmd shortcuts (kitty protocol — macOS native dialogs & views)
        { key: "cmd-t", commandId: "task_dialog" },
        { key: "cmd-g", commandId: "filter" },
        { key: "cmd-p", commandId: "toggle_detail_pane" },
        { key: "cmd-,", commandId: "settings" },

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
}

/** Flat array of all default keybindings (layers flattened in priority order).
 * Recomputed each call so verb-location grid picks up current favorites. */
export function defaultKeybindings(): Keybinding[] {
  return defaultKeybindingLayers().flatMap((layer) => layer.bindings)
}

// Initialize with defaults (recomputes verb-location grid from current favorites)
export function initDefaultKeybindings(): void {
  clearKeybindings()
  registerKeybindings(defaultKeybindings())
}
