/**
 * Help Screen Data
 *
 * Generates structured help data from the keybinding registry and command
 * definitions. Used by HelpOverlay to render auto-generated keyboard
 * shortcut reference.
 *
 * Features:
 * - Sub-categorizes fold layer by chord prefix (g→Go To, m→Move, etc.)
 * - Combines related commands into single entries (hjkl→navigate)
 * - Uses macOS key icons (⌃, ⌘, ⌥, ⇧, ↑, ⌫, ⎋, etc.)
 * - Provides verb × location grid data
 */

import { defaultKeybindingLayers } from "./keybindings.ts"
import type { Keybinding } from "./keybindings.ts"
import { allCommands } from "./commands/index.ts"
import type { CommandDef } from "./types.ts"

export interface HelpItem {
  keys: string[]
  command: string
  description: string
}

export interface HelpSection {
  category: string
  items: HelpItem[]
}

export interface VerbGridRow {
  key: string
  location: string
  goto?: string
  move?: string
  add?: string
}

// ── Excluded commands and layers ─────────────────────────────────────

/** Command IDs to exclude from help (internal/modal/low-level) */
const EXCLUDED_COMMANDS = new Set([
  "noop",
  "bell",
  // Modal/dialog internal commands
  "help.dismiss",
  "help.scroll_up",
  "help.scroll_down",
  "delete_confirm.confirm",
  "delete_confirm.cancel",
  "console.close",
  "toast.dismiss",
  // Dialog navigation (internal plumbing)
  "dialog.nav_up",
  "dialog.nav_down",
  "dialog.nav_left",
  "dialog.nav_right",
  "dialog.confirm",
  "dialog.cancel",
  "dialog.toggle_search_scope",
  "filter.nav_left",
  "filter.nav_right",
  "filter.clear_all",
  // Move mode confirm/cancel (contextual)
  "confirm_move",
  "cancel_move",
  // Search replace internal
  "search_replace.close",
  "search_replace.next",
  "search_replace.prev",
  "search_replace.replace",
  "search_replace.replace_all",
  "search_replace.toggle_regex",
  "search_replace.tab_field",
  // Find bar internal
  "find_next",
  "find_prev",
  "find_close",
  "find_confirm",
  // Visual mode exit (contextual)
  "visual_mode_exit",
  // Text editing (shown only when editing, not in help)
  "text.delete_backward",
  "text.delete_forward",
  "text.cursor_left",
  "text.cursor_right",
  "text.cursor_up",
  "text.cursor_down",
  "text.cursor_start",
  "text.cursor_end",
  "text.delete_word",
  "text.delete_to_start",
  "text.delete_to_end",
  "text.confirm",
  "text.exit_edit",
  "text.yank",
  "text.bold",
  "text.italic",
  // Block editing (internal)
  "edit_block.navigate_up",
  "edit_block.navigate_down",
  // Detail pane (internal)
  "detail_pane.scroll_down",
  "detail_pane.scroll_up",
  "detail_pane.cursor_down",
  "detail_pane.cursor_up",
  "detail_pane.enter",
  // Close/quit is generic Escape behavior
  "close_or_quit",
  // Generated favorites/column commands (shown in Quick Access)
  ...Array.from({ length: 9 }, (_, i) => `favorite_${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `column_${i + 1}`),
  // Verb-grid commands (shown in the verb × location grid, not in sections)
  "goto_inbox",
  "goto_journal",
  "goto_home",
  "goto_archive",
  "goto_next",
  "project_picker",
  "move_to_inbox",
  "move_to_journal",
  "move_to_home",
  "move_to_next",
  "reparent_picker",
  "move_to_project",
  "goto_tag",
  "goto_assignee",
  "goto_project",
  "goto_backlink",
  "add_tag",
  "add_assignee",
  "add_project",
  "add_backlink",
  "add_link",
  "insert_child",
  "add_sibling_below",
  "insert_at_parent",
  "enter_move_mode",
])

/** Layers to skip entirely (they contain internal/modal bindings) */
const EXCLUDED_LAYERS = new Set([
  "modal",
  "text",
  "block-edit",
  "inline-edit-barrier",
  "detail-pane",
  "visual-mode",
  "dialog",
  "filter-dialog",
  "search-replace",
  "local-find",
])

// ── Section mapping and ordering ─────────────────────────────────────

/** Map layer names to user-facing help categories */
const LAYER_CATEGORY_MAP: Record<string, string> = {
  global: "System",
  navigation: "Navigation",
  selection: "Selection",
  edit: "Editing",
  task: "Task",
  fold: "View", // fold commands merge into View; sub-categorized by chord prefix below
  view: "View",
  history: "Editing", // merge into Editing
  tui: "System", // merge into System
}

/** Per-command section overrides (when a command is in the wrong layer for help purposes) */
const COMMAND_SECTION_OVERRIDES: Record<string, string> = {
  // Navigation layer → Editing
  enter_inline_edit: "Editing",
  // Navigation/tui layer → View
  toggle_detail_pane: "View",
  close_detail_pane: "View",
  open_detail_pane: "View",
  focus_board: "View",
  focus_detail: "View",
  follow_link: "View",
  // Consolidate duplicates: commands appearing in multiple layers → single section
  capture_inbox: "Task",
  capture_dialog: "Task",
  task_dialog: "Task",
  command_palette: "System",
  settings: "System",
  // Navigation layer → other sections
  zoom_to_root: "Navigation",
  open_in_system: "System",
  open_in_terminal: "System",
  // g-chord bindings that belong in other sections (verb grid handles locations)
  cursor_first: "Navigation",
  cursor_last: "Navigation",
  new_item: "Editing",
  toggle_collapse: "View",
  toggle_show_ignored: "View",
  cycle_view_mode: "View",
}

/** Sub-categorize fold layer bindings by chord prefix */
const CHORD_CATEGORY_MAP: Record<string, string> = {
  g: "Go To",
  m: "Move",
  a: "Add",
  t: "Task",
  "Ctrl+w": "Panes",
}

/** Bare symbol keys in fold layer that belong to specific sections */
const FOLD_CATEGORY_OVERRIDES: Record<string, string> = {
  "@": "Add",
  "#": "Add",
  "+": "Add",
  "[": "Add",
}

/** Command IDs that belong in the View section (fold commands, not sub-categorized by chord) */
const FOLD_COMMANDS = new Set(["fold_node", "unfold_node", "fold_all", "unfold_all"])

/** Display order for sections */
const SECTION_ORDER = ["Navigation", "Editing", "Selection", "Task", "View", "Panes", "System"]

// ── Concise descriptions ─────────────────────────────────────────────

/** Short descriptions to replace verbose command descriptions */
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  // Navigation
  cursor_down: "move down",
  cursor_up: "move up",
  cursor_left: "move left",
  cursor_right: "move right",
  cursor_first: "go to top",
  cursor_last: "go to bottom",
  block_nav_down: "down by block",
  block_nav_up: "up by block",
  page_up: "half page up",
  page_down: "half page down",
  zoom_inwards: "zoom in",
  zoom_outwards: "zoom out",
  zoom_in: "zoom to cursor",
  zoom_to_root: "zoom to root",
  nav_back: "back",
  nav_forward: "forward",
  sibling_board_next: "next board",
  sibling_board_prev: "prev board",
  follow_link: "follow link",
  // Editing
  enter_inline_edit: "edit",
  insert_below: "new item below",
  insert_above: "new item above",
  clipboard_cut: "cut",
  clipboard_copy: "copy",
  clipboard_paste: "paste",
  delete_node: "delete",
  indent_node: "indent",
  outdent: "outdent",
  duplicate_node: "duplicate",
  undo: "undo",
  redo: "redo",
  shift_up: "shift up",
  shift_down: "shift down",
  shift_left: "shift left",
  shift_right: "shift right",
  // Selection
  select_toggle: "toggle select",
  select_all: "select all",
  extend_select_up: "extend up",
  extend_select_down: "extend down",
  extend_select_left: "extend left",
  extend_select_right: "extend right",
  // Task
  toggle_task_done: "toggle done",
  cycle_task_status: "cycle status",
  archive: "archive",
  capture_inbox: "capture to inbox",
  capture_dialog: "capture (dialog)",
  task_dialog: "task properties",
  set_assignee: "set assignee",
  set_due_date: "set due date",
  set_priority: "set priority",
  set_start_date: "set start date",
  set_recurring: "set recurring",
  toggle_hide_done: "toggle done",
  set_label: "set label",
  // Fold
  fold_node: "fold",
  unfold_node: "unfold",
  fold_all: "fold all",
  unfold_all: "unfold all",
  // View/System (formerly Go To)
  open_in_system: "open in app",
  open_in_terminal: "open in terminal",
  new_item: "new item dialog",
  toggle_collapse: "collapse column",
  toggle_show_ignored: "show ignored",
  cycle_view_mode: "cycle view",
  // Panes
  pane_split_vertical: "split v",
  pane_split_horizontal: "split h",
  pane_close: "close pane",
  pane_focus_left: "focus left",
  pane_focus_down: "focus down",
  pane_focus_up: "focus up",
  pane_focus_right: "focus right",
  pane_focus_previous: "prev pane",
  pane_focus_next: "next pane",
  pane_focus_prev: "prev pane",
  pane_resize_grow: "grow width",
  pane_resize_shrink: "shrink width",
  pane_resize_grow_vertical: "grow height",
  pane_resize_shrink_vertical: "shrink height",
  pane_equalize: "equalize",
  pane_zoom: "zoom pane",
  pane_only: "close others",
  pane_swap_left: "swap left",
  pane_swap_down: "swap down",
  pane_swap_up: "swap up",
  pane_swap_right: "swap right",
  // View
  visual_mode_enter: "visual mode",
  cycle_icon_style: "cycle icons",
  show_help: "help",
  increase_content_lines: "show more",
  decrease_content_lines: "show less",
  command_palette: "command palette",
  toggle_detail_pane: "detail pane",
  close_detail_pane: "close detail",
  open_detail_pane: "open detail",
  focus_board: "focus board",
  focus_detail: "focus detail",
  // System
  "console.toggle": "console",
  quit: "quit",
  local_find: "find",
  search_replace: "find & replace",
  filter: "filter",
  settings: "settings",
}

// ── Combine rules ────────────────────────────────────────────────────

/** Rules for combining related commands into single display entries */
interface CombineRule {
  commands: string[]
  display: string
  description: string
  section: string
}

const COMBINE_RULES: CombineRule[] = [
  // Navigation
  {
    commands: ["cursor_down", "cursor_up", "cursor_left", "cursor_right"],
    display: "hjkl",
    description: "navigate",
    section: "Navigation",
  },
  { commands: ["zoom_inwards", "zoom_outwards"], display: "z / Z", description: "zoom in/out", section: "Navigation" },
  { commands: ["nav_back", "nav_forward"], display: "{ / }", description: "back/forward", section: "Navigation" },
  {
    commands: ["block_nav_down", "block_nav_up"],
    display: "J K",
    description: "move by block",
    section: "Navigation",
  },
  { commands: ["page_up", "page_down"], display: "⌃u / ⌃d", description: "half page up/down", section: "Navigation" },
  { commands: ["cursor_first", "cursor_last"], display: "gg / G", description: "top/bottom", section: "Navigation" },
  {
    commands: ["sibling_board_next", "sibling_board_prev"],
    display: "⌃j / ⌃k",
    description: "next/prev board",
    section: "Navigation",
  },
  // Editing
  {
    commands: ["insert_below", "insert_above"],
    display: "o / O",
    description: "new item below/above",
    section: "Editing",
  },
  { commands: ["undo", "redo"], display: "u / U", description: "undo/redo", section: "Editing" },
  { commands: ["indent_node", "outdent"], display: "⇥ / ⇧⇥", description: "indent/outdent", section: "Editing" },
  {
    commands: ["clipboard_copy", "clipboard_cut", "clipboard_paste"],
    display: "y / d / p",
    description: "copy/cut/paste",
    section: "Editing",
  },
  // Selection
  {
    commands: ["extend_select_up", "extend_select_down", "extend_select_left", "extend_select_right"],
    display: "⇧↑↓←→",
    description: "extend selection",
    section: "Selection",
  },
  // Task
  {
    commands: ["toggle_task_done", "cycle_task_status"],
    display: "x / X",
    description: "toggle/cycle status",
    section: "Task",
  },
  {
    commands: ["capture_inbox", "capture_dialog"],
    display: "c C ⌘n",
    description: "capture to inbox",
    section: "Task",
  },
  // Fold (merged into View)
  { commands: ["fold_node", "unfold_node"], display: "H / L", description: "fold/unfold", section: "View" },
  { commands: ["fold_all", "unfold_all"], display: "< / >", description: "fold/unfold all", section: "View" },
  // View
  {
    commands: ["increase_content_lines", "decrease_content_lines"],
    display: "+ / -",
    description: "show more/less",
    section: "View",
  },
  {
    commands: ["open_detail_pane", "close_detail_pane", "toggle_detail_pane"],
    display: "D ⌃i ⌘w",
    description: "detail pane",
    section: "View",
  },
  {
    commands: ["focus_board", "focus_detail"],
    display: "⌘h / ⌘l",
    description: "focus board/detail",
    section: "View",
  },
  {
    commands: ["open_in_system", "open_in_terminal"],
    display: "⌘o / ⌘⇧o",
    description: "open in app/terminal",
    section: "System",
  },
  // Panes
  {
    commands: ["pane_split_vertical", "pane_split_horizontal"],
    display: "⌃w v / s",
    description: "split v/h",
    section: "Panes",
  },
  {
    commands: ["pane_focus_left", "pane_focus_down", "pane_focus_up", "pane_focus_right"],
    display: "⌃w hjkl",
    description: "focus pane",
    section: "Panes",
  },
  {
    commands: ["pane_resize_grow", "pane_resize_shrink"],
    display: "⌃w > <",
    description: "resize width",
    section: "Panes",
  },
  {
    commands: ["pane_resize_grow_vertical", "pane_resize_shrink_vertical"],
    display: "⌃w + -",
    description: "resize height",
    section: "Panes",
  },
  {
    commands: ["pane_swap_left", "pane_swap_down", "pane_swap_up", "pane_swap_right"],
    display: "⌃w HJKL",
    description: "swap pane",
    section: "Panes",
  },
  {
    commands: ["pane_focus_next", "pane_focus_prev"],
    display: "⌃w ⇥ ⇧⇥",
    description: "cycle panes",
    section: "Panes",
  },
  // Shifting
  {
    commands: ["shift_up", "shift_down", "shift_left", "shift_right"],
    display: "⌘↑↓←→",
    description: "shift node",
    section: "Editing",
  },
]

// ── Verb × Location grid ─────────────────────────────────────────────

export const VERB_GRID: VerbGridRow[] = [
  // Locations
  { key: "i", location: "inbox", goto: "g i", move: "m i" },
  { key: "j", location: "journal", goto: "g j", move: "m j" },
  { key: "h", location: "home", goto: "g h", move: "m h" },
  { key: "e", location: "archive", goto: "g e" },
  { key: "N", location: "next", goto: "g N" },
  { key: "p", location: "picker", goto: "g p", move: "⌃r m p" },
  // Targets (add, with go/move stubs)
  { key: "#", location: "tag", goto: "g #", add: "# a #" },
  { key: "@", location: "assignee", goto: "g @", add: "@ a @" },
  { key: "+", location: "project", goto: "g +", move: "m +", add: "+ a +" },
  { key: "[", location: "backlink", goto: "g [", add: "[ a [" },
  { key: "l", location: "link", add: "⌃l" },
  // Tree structure
  { key: "i", location: "child", add: "a i" },
  { key: "j", location: "sibling", add: "a j" },
  { key: "h", location: "at parent", add: "a h" },
  // Move
  { key: "m", location: "move mode", move: "m" },
]

// ── macOS key formatting ─────────────────────────────────────────────

/** Format a keybinding into a human-readable key string with macOS icons */
function formatKey(binding: Keybinding): string {
  const parts: string[] = []

  if (binding.ctrl) parts.push("⌃")
  if (binding.meta) parts.push("⌥")
  if (binding.super) parts.push("⌘")
  if (binding.alt) parts.push("⌥")
  if (binding.shift) parts.push("⇧")

  let keyName = binding.key
  switch (keyName) {
    case "ArrowUp":
      keyName = "↑"
      break
    case "ArrowDown":
      keyName = "↓"
      break
    case "ArrowLeft":
      keyName = "←"
      break
    case "ArrowRight":
      keyName = "→"
      break
    case "Backspace":
      keyName = "⌫"
      break
    case "Delete":
      keyName = "⌦"
      break
    case "Escape":
      keyName = "⎋"
      break
    case "Enter":
      keyName = "↩"
      break
    case "Tab":
      keyName = "⇥"
      break
    case " ":
      keyName = "␣"
      break
  }

  if (binding.chord) {
    const prefix = formatChordPrefix(binding.chord)
    if (parts.length > 0) {
      return `${prefix} ${parts.join("")}${keyName}`
    }
    return `${prefix} ${keyName}`
  }

  if (parts.length > 0) {
    return `${parts.join("")}${keyName}`
  }
  return keyName
}

/** Format chord prefix with macOS icons */
function formatChordPrefix(chord: string): string {
  if (chord === "Ctrl+w") return "⌃w"
  return chord
}

// ── Section building ─────────────────────────────────────────────────

/** Determine the section for a fold-layer binding */
function getFoldCategory(binding: Keybinding): string {
  // Chord bindings → sub-categorize by prefix
  if (binding.chord) {
    return CHORD_CATEGORY_MAP[binding.chord] ?? "View"
  }
  // Bare symbol overrides
  if (FOLD_CATEGORY_OVERRIDES[binding.key]) {
    return FOLD_CATEGORY_OVERRIDES[binding.key]
  }
  // Fold-specific commands go to View
  if (FOLD_COMMANDS.has(binding.commandId)) {
    return "View"
  }
  // Standalone fallbacks (g, m, a, t without chord) — skip
  return ""
}

/** Add an item to a section, merging keys for duplicate commandIds */
function addItem(
  sectionMap: Map<string, HelpItem[]>,
  category: string,
  key: string,
  commandId: string,
  description: string,
) {
  let items = sectionMap.get(category)
  if (!items) {
    items = []
    sectionMap.set(category, items)
  }
  const existing = items.find((i) => i.command === commandId)
  if (existing) {
    if (existing.keys.length < 2 && !existing.keys.includes(key)) {
      existing.keys.push(key)
    }
  } else {
    items.push({ keys: [key], command: commandId, description })
  }
}

/** Apply combine rules: merge related commands into single entries */
function applyCombineRules(sectionMap: Map<string, HelpItem[]>): void {
  for (const rule of COMBINE_RULES) {
    const items = sectionMap.get(rule.section)
    if (!items) continue

    // Remove individual entries
    const remaining = items.filter((item) => !rule.commands.includes(item.command))

    // Find insertion point (where first combined command was)
    const firstIdx = items.findIndex((item) => rule.commands.includes(item.command))
    if (firstIdx < 0) continue

    // Insert combined entry at the position of the first matched command
    const combinedItem: HelpItem = {
      keys: [rule.display],
      command: rule.commands[0],
      description: rule.description,
    }

    // Reconstruct: items before first match + combined + items after (excluding matched)
    const before = remaining.filter((_, i) => {
      const origIdx = items.indexOf(remaining[i])
      return origIdx < firstIdx
    })
    const after = remaining.filter((_, i) => {
      const origIdx = items.indexOf(remaining[i])
      return origIdx > firstIdx
    })

    sectionMap.set(rule.section, [...before, combinedItem, ...after])
  }
}

/**
 * Validate that all command IDs in help config maps actually exist.
 * Called once at module load. Throws on invalid IDs — these are programming errors.
 */
function validateHelpConfig(knownIds: Set<string>): void {
  for (const id of Object.keys(DESCRIPTION_OVERRIDES)) {
    if (!knownIds.has(id)) throw new Error(`DESCRIPTION_OVERRIDES: unknown command "${id}"`)
  }
  for (const id of Object.keys(COMMAND_SECTION_OVERRIDES)) {
    if (!knownIds.has(id)) throw new Error(`COMMAND_SECTION_OVERRIDES: unknown command "${id}"`)
  }
  for (const rule of COMBINE_RULES) {
    for (const id of rule.commands) {
      if (!knownIds.has(id)) throw new Error(`COMBINE_RULES "${rule.display}": unknown command "${id}"`)
    }
  }
}

// Validate at module load — catches typos immediately
const _knownCommandIds = new Set(allCommands.map((c) => c.id))
validateHelpConfig(_knownCommandIds)

/**
 * Build help screen data from the keybinding registry.
 *
 * Iterates all keybinding layers, collects key→commandId mappings,
 * resolves command descriptions, groups by section, applies
 * combine rules, and sorts by SECTION_ORDER.
 */
export function getHelpScreenData(): HelpSection[] {
  const commandMap = new Map<string, CommandDef>()
  for (const cmd of allCommands) {
    commandMap.set(cmd.id, cmd)
  }

  const sectionMap = new Map<string, HelpItem[]>()

  for (const layer of defaultKeybindingLayers) {
    if (EXCLUDED_LAYERS.has(layer.name)) continue

    for (const binding of layer.bindings) {
      if (binding.wildcard) continue
      if (EXCLUDED_COMMANDS.has(binding.commandId)) continue

      const key = formatKey(binding)
      const cmd = commandMap.get(binding.commandId)
      const desc = DESCRIPTION_OVERRIDES[binding.commandId] ?? cmd?.description ?? cmd?.name ?? binding.commandId

      // Determine category: per-command override > fold sub-category > layer default
      let category: string
      if (COMMAND_SECTION_OVERRIDES[binding.commandId]) {
        category = COMMAND_SECTION_OVERRIDES[binding.commandId]
      } else if (layer.name === "fold") {
        category = getFoldCategory(binding)
        if (!category) continue // skip standalone fallbacks
      } else {
        category = LAYER_CATEGORY_MAP[layer.name] ?? layer.name
      }

      addItem(sectionMap, category, key, binding.commandId, desc)
    }
  }

  // Apply combine rules
  applyCombineRules(sectionMap)

  // Add quick-access entry to Navigation (1-9 favorites are generated, not in registry)
  const navItems = sectionMap.get("Navigation")
  if (navItems) {
    navItems.push({ keys: ["1-9"], command: "_favorites", description: "jump to board" })
  }

  // Sort sections by defined order
  const sections: HelpSection[] = []
  for (const name of SECTION_ORDER) {
    const items = sectionMap.get(name)
    if (items && items.length > 0) {
      sections.push({ category: name, items })
    }
  }

  // Append any sections not in SECTION_ORDER
  for (const [name, items] of sectionMap) {
    if (!SECTION_ORDER.includes(name) && items.length > 0) {
      sections.push({ category: name, items })
    }
  }

  return sections
}
