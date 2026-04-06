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
  /** Optional hint rendered dim after the section header */
  hint?: string
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
      { keys: ["hjkl", "↑↓←→"], command: "cursor_down", description: "navigate" },
      { keys: ["z / Z"], command: "zoom_inwards", description: "zoom in / out" },
      { keys: ["g / G"], command: "cursor_first", description: "first / last" },
      { keys: ["J / K"], command: "block_nav_down", description: "next / prev visible block" },
      { keys: ["⌃u/d", "PgUp / Dn"], command: "page_up", description: "half page up / down" },
      { keys: ["{ / }", "⌘[/]"], command: "nav_back", description: "back / forward" },
      { keys: ["⌃j/k"], command: "sibling_board_next", description: "next / prev board" },
      { keys: ["0-9"], command: "_favorites", description: "jump to favorites" },
      { keys: ["⌃⏎"], command: "follow_link", description: "follow link" },
    ],
  },
  {
    category: "Editing",
    items: [
      { keys: ["i", "⏎"], command: "enter_inline_edit", description: "edit" },
      { keys: ["o / O", "⌘⏎"], command: "insert_below", description: "new item below / above" },
      { keys: ["⌘⇧⏎"], command: "new_item", description: "new item dialog" },
      { keys: ["⌫ / ⌦"], command: "delete_node", description: "delete / forward" },
      { keys: ["⌘d"], command: "duplicate_node", description: "duplicate" },
      { keys: ["⌘c/x/v"], command: "clipboard_copy", description: "copy / cut / paste" },
      { keys: ["u / U", "⌘z"], command: "undo", description: "undo / redo" },
      { keys: ["⇥ / ⇧⇥"], command: "indent_node", description: "indent / outdent" },
      { keys: ["⌘↑↓←→", "⌥↑↓←→"], command: "shift_up", description: "shift node" },
    ],
  },
  {
    category: "Selection",
    items: [
      { keys: ["v v"], command: "visual_mode_enter", description: "visual mode" },
      { keys: ["␣"], command: "select_toggle", description: "toggle select" },
      { keys: ["⌃a", "⌘a"], command: "select_all", description: "select all" },
      { keys: ["⇧↑↓←→"], command: "extend_select_up", description: "extend selection" },
    ],
  },
  {
    category: "Task",
    items: [
      { keys: ["x / X"], command: "toggle_task_done", description: "toggle / cycle status" },
      { keys: ["⌃t", "⌘t", "t t"], command: "task_dialog", description: "task properties" },
      { keys: ["t -"], command: "clear_task", description: "clear taskness" },
      { keys: ["t o"], command: "set_assignee", description: "set owner" },
      { keys: ["t d/s"], command: "set_due_date", description: "set due / start date" },
      { keys: ["t l"], command: "set_label", description: "set label" },
      { keys: ["t !"], command: "set_priority", description: "set priority" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: [", / ."], command: "increase_content_lines", description: "fewer / more lines" },
      { keys: ["H / L"], command: "fold_more", description: "fold / unfold more" },
      { keys: ["< / >"], command: "fold_board_more", description: "fold / unfold board" },
      { keys: ["D", "⌃i", "⌘p"], command: "toggle_detail_pane", description: "detail pane" },
      { keys: ["v ,", "V"], command: "filter", description: "view settings" },
      { keys: ["v x"], command: "hide_node", description: "hide item" },
      { keys: ["v X"], command: "toggle_show_hidden", description: "show hidden items" },
      { keys: ["v d"], command: "toggle_hide_done", description: "hide done" },
      { keys: ["v -"], command: "clear_filters", description: "reset view" },
      { keys: ["v m/i"], command: "cycle_view_mode", description: "cycle view / icons" },
      { keys: ["⌘h/l"], command: "focus_board", description: "focus board / detail" },
    ],
  },
  {
    category: "Panes",
    items: [
      { keys: ["v s"], command: "pane_split_vertical", description: "split" },
      { keys: ["v h/l"], command: "pane_focus_left", description: "focus left / right" },
      { keys: ["v j/k"], command: "pane_focus_down", description: "focus down / up" },
      { keys: ["n/N", "v n/N"], command: "pane_focus_next", description: "next / prev pane" },
      { keys: ["v H/L"], command: "pane_swap_left", description: "swap left / right" },
      { keys: ["v J/K"], command: "pane_swap_down", description: "swap down / up" },
      { keys: ["v w  v >/<  v ="], command: "pane_close", description: "close / resize / equalize" },
      { keys: ["v o"], command: "pane_only", description: "close others" },
    ],
  },
  {
    category: "System",
    items: [
      { keys: ["⌘⇧f"], command: "search_replace", description: "find & replace" },
      { keys: ["C", "c i", "⌘n"], command: "capture_dialog", description: "capture" },
      { keys: [":", "⌃k", "⌘k"], command: "command_palette", description: "command palette" },
      { keys: ["/", "⌘f"], command: "local_find", description: "find on screen" },
      { keys: ["n / N", "⌃n/p"], command: "find_next", description: "find next / prev" },
      { keys: ["?"], command: "show_help", description: "help" },
      { keys: [",", "⌘,"], command: "settings", description: "settings" },
      { keys: ["`"], command: "console.toggle", description: "console" },
      { keys: ["q", "esc"], command: "quit", description: "quit" },
    ],
  },
]

// ── Verb x Location grid ──────────────────────────────────────────────

export const VERB_GRID: VerbGridRow[] = [
  // Navigation
  { key: "g", location: "first", goto: "g g", move: "m g" },
  { key: "G", location: "last", goto: "g G", move: "m G" },
  { key: "p", location: "parent", goto: "g p", move: "m p" },
  // Board locations
  { key: "h", location: "home (@next)", goto: "g h", move: "m h", add: "a h" },
  { key: "i", location: "inbox", goto: "g i", move: "m i", add: "a i", create: "c i" },
  { key: "j", location: "journal", goto: "g j", move: "m j", add: "a j" },
  { key: "a", location: "archive", goto: "g a", move: "m a" },
  // Favorites (0-9) — bare 0-9 jumps directly, g 0-9 also works
  { key: "0-9", location: "favorites", goto: "g 0-9  0-9", move: "m 0-9", add: "a 0-9", separator: true },
  // Targets (pickers) — bare key is shortcut for a-prefix chord
  { key: "#", location: "tag", add: "a #  #", separator: true },
  { key: "@", location: "context", add: "a @  @" },
  { key: "+", location: "project", goto: "g +", move: "m +", add: "a +  +" },
  { key: "[", location: "item", move: "m [", add: "a [" },
]

// ── Public API ────────────────────────────────────────────────────────

/** Return the static help sections array */
export function getHelpScreenData(): HelpSection[] {
  return HELP_SECTIONS
}
