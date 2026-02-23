/**
 * Help Screen Data
 *
 * Declarative help sections and verb grid for the HelpOverlay.
 * Hand-crafted for clarity — no auto-generation from keybinding layers.
 */

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
  create?: string
  /** Render a blank line before this row */
  separator?: boolean
}

// ── Help sections ─────────────────────────────────────────────────────

const HELP_SECTIONS: HelpSection[] = [
  {
    category: "Navigation",
    items: [
      { keys: ["hjkl / ↑↓←→"], command: "cursor_down", description: "navigate" },
      { keys: ["z / Z"], command: "zoom_inwards", description: "zoom in/out" },
      { keys: ["gg / G"], command: "cursor_first", description: "top/bottom" },
      { keys: ["J K"], command: "block_nav_down", description: "move by block" },
      { keys: ["⌃u / ⌃d / PgUp/Dn"], command: "page_up", description: "half page up/down" },
      { keys: ["{ / } / ⌘[/]"], command: "nav_back", description: "back/forward" },
      { keys: ["⌃j / ⌃k"], command: "sibling_board_next", description: "next/prev board" },
      { keys: ["1-9"], command: "_favorites", description: "jump to board" },
    ],
  },
  {
    category: "Editing",
    items: [
      { keys: ["i / Enter"], command: "enter_inline_edit", description: "edit" },
      { keys: ["o / O / ⌘Enter"], command: "insert_below", description: "new item below/above" },
      { keys: ["n / ⌘⇧Enter"], command: "new_item", description: "new item dialog" },
      { keys: ["Backspace / Del"], command: "delete_node", description: "delete" },
      { keys: ["⌘d"], command: "duplicate_node", description: "duplicate" },
      { keys: ["y / d / p / ⌘c/x/v"], command: "clipboard_copy", description: "copy/cut/paste" },
      { keys: ["u / U / ⌘z"], command: "undo", description: "undo/redo" },
      { keys: ["Tab / Shift+Tab"], command: "indent_node", description: "indent/outdent" },
      { keys: ["⌘↑↓←→ / ⌥↑↓←→"], command: "shift_up", description: "shift node" },
    ],
  },
  {
    category: "Selection",
    items: [
      { keys: ["v Space"], command: "visual_mode_enter", description: "visual mode" },
      { keys: ["Space"], command: "select_toggle", description: "toggle select" },
      { keys: ["A / ⌃a / ⌘a"], command: "select_all", description: "select all" },
      { keys: ["Shift+↑↓←→"], command: "extend_select_up", description: "extend selection" },
    ],
  },
  {
    category: "Task",
    items: [
      { keys: ["x / X"], command: "toggle_task_done", description: "toggle/cycle status" },
      { keys: ["e"], command: "archive", description: "archive" },
      { keys: ["⌃t / ⌘t / t t"], command: "task_dialog", description: "task properties" },
      { keys: ["t -"], command: "clear_task", description: "clear taskness" },
      { keys: ["t o"], command: "set_assignee", description: "set owner" },
      { keys: ["t d"], command: "set_due_date", description: "set due date" },
      { keys: ["t !"], command: "set_priority", description: "set priority" },
      { keys: ["t s"], command: "set_start_date", description: "set start date" },
      { keys: ["t l"], command: "set_label", description: "set label" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: ["v Space"], command: "visual_mode_enter", description: "visual mode" },
      { keys: ["v v"], command: "cycle_view_mode", description: "cycle view" },
      { keys: ["v c"], command: "toggle_collapse", description: "collapse column" },
      { keys: ["v d"], command: "toggle_hide_done", description: "hide/show done" },
      { keys: ["v h"], command: "ignore_node", description: "ignore (hide)" },
      { keys: ["v H"], command: "toggle_show_ignored", description: "show ignored" },
      { keys: ["v -"], command: "clear_filters", description: "clear filters" },
      { keys: ["H / L"], command: "fold_node", description: "fold/unfold" },
      { keys: ["< / >"], command: "fold_all", description: "fold/unfold all" },
      { keys: ["D / ⌃i / ⌘p"], command: "toggle_detail_pane", description: "detail pane" },
      { keys: ["⌘h / ⌘l"], command: "focus_board", description: "focus board/detail" },
      { keys: ["⌃Enter"], command: "follow_link", description: "follow link" },
      { keys: ["+ / -"], command: "increase_content_lines", description: "show more/less" },
    ],
  },
  {
    category: "Panes",
    items: [
      { keys: ["⌃w v / s"], command: "pane_split_vertical", description: "split v/h" },
      { keys: ["⌃w hjkl"], command: "pane_focus_left", description: "focus pane" },
      { keys: ["⌃w > <"], command: "pane_resize_grow", description: "resize width" },
      { keys: ["⌃w + -"], command: "pane_resize_grow_vertical", description: "resize height" },
      { keys: ["⌃w HJKL"], command: "pane_swap_left", description: "swap pane" },
      { keys: ["⌃w Tab"], command: "pane_focus_next", description: "cycle panes" },
      { keys: ["⌃w o"], command: "pane_only", description: "close others" },
      { keys: ["⌃w q"], command: "pane_close", description: "close pane" },
      { keys: ["⌃w z"], command: "pane_zoom", description: "zoom pane" },
      { keys: ["⌃w ="], command: "pane_equalize", description: "equalize" },
    ],
  },
  {
    category: "System",
    items: [
      { keys: ["F / ⌃g / ⌘g"], command: "filter", description: "filter" },
      { keys: ["S / ⌘f"], command: "search_replace", description: "search / replace" },
      { keys: ["C / c c / ⌘n"], command: "capture_dialog", description: "capture dialog" },
      { keys: [": / ⌃k / ⌘k"], command: "command_palette", description: "command palette" },
      { keys: ["/ / ⌃f"], command: "local_find", description: "find on screen" },
      { keys: ["?"], command: "show_help", description: "help" },
      { keys: [", / ⌘,"], command: "settings", description: "settings" },
      { keys: ["`"], command: "console.toggle", description: "console" },
      { keys: ["q / Esc"], command: "quit", description: "quit" },
    ],
  },
]

// ── Verb x Location grid ──────────────────────────────────────────────

export const VERB_GRID: VerbGridRow[] = [
  // Board locations
  { key: "/", location: "root", goto: "g /" },
  { key: "h", location: "home (@next)", goto: "g h", move: "m h", create: "c h" },
  { key: "i", location: "inbox", goto: "g i", move: "m i", create: "c i" },
  { key: "j", location: "journal", goto: "g j", move: "m j", create: "c j" },
  { key: "e", location: "archive", goto: "g e", move: "m e", add: "a e", create: "c e" },
  // Targets (pickers / wikilink types)
  { key: "[", location: "item", goto: "g [", move: "m p", add: "a [", separator: true },
  { key: "#", location: "tag", goto: "g #", add: "#" },
  { key: "@", location: "context", goto: "g @", add: "@" },
  { key: "+", location: "project", goto: "g +", move: "m +", add: "+" },
]

// ── Public API ────────────────────────────────────────────────────────

/** Return the static help sections array */
export function getHelpScreenData(): HelpSection[] {
  return HELP_SECTIONS
}
