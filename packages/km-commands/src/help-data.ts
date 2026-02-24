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
      { keys: ["gg / G"], command: "cursor_first", description: "top / bottom" },
      { keys: ["J / K"], command: "block_nav_down", description: "next / prev block" },
      { keys: ["⌃u / ⌃d", "PgUp / Dn"], command: "page_up", description: "half page up / down" },
      { keys: ["{ / }", "⌘[ / ⌘]"], command: "nav_back", description: "back / forward" },
      { keys: ["⌃j / ⌃k"], command: "sibling_board_next", description: "next / prev board" },
      { keys: ["0-9"], command: "_favorites", description: "jump to favorites" },
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
      { keys: ["y / d / p", "⌘c / ⌘x / ⌘v"], command: "clipboard_copy", description: "copy / cut / paste" },
      { keys: ["u / U", "⌘z"], command: "undo", description: "undo / redo" },
      { keys: ["⇥ / ⇧⇥"], command: "indent_node", description: "indent / outdent" },
      { keys: ["⌘↑↓←→", "⌥↑↓←→"], command: "shift_up", description: "shift node" },
    ],
  },
  {
    category: "Selection",
    items: [
      { keys: ["v ␣"], command: "visual_mode_enter", description: "visual mode" },
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
      { keys: ["t d"], command: "set_due_date", description: "set due date" },
      { keys: ["t s"], command: "set_start_date", description: "set start date" },
      { keys: ["t l"], command: "set_label", description: "set label" },
      { keys: ["t !"], command: "set_priority", description: "set priority" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: ["v ␣"], command: "visual_mode_enter", description: "visual mode" },
      { keys: ["v m"], command: "cycle_view_mode", description: "cycle view" },
      { keys: ["v c"], command: "toggle_collapse", description: "collapse column" },
      { keys: ["v d"], command: "toggle_hide_done", description: "toggle done" },
      { keys: ["v h"], command: "ignore_node", description: "ignore (hide)" },
      { keys: ["v C"], command: "toggle_show_ignored", description: "show ignored" },
      { keys: ["v i"], command: "cycle_icon_style", description: "cycle icons" },
      { keys: ["v -"], command: "clear_filters", description: "clear filters" },
      { keys: ["H / L"], command: "fold_node", description: "fold / unfold" },
      { keys: ["< / >"], command: "fold_all", description: "fold / unfold all" },
      { keys: ["D", "⌃i", "⌘p"], command: "toggle_detail_pane", description: "detail pane" },
      { keys: ["⌘h / ⌘l"], command: "focus_board", description: "focus board / detail" },
      { keys: ["⌃⏎"], command: "follow_link", description: "follow link" },
      { keys: ["+ / -"], command: "increase_content_lines", description: "more / less lines" },
    ],
  },
  {
    category: "Panes",
    items: [
      { keys: ["⌃w v / ⌃w s"], command: "pane_split_vertical", description: "split v / h" },
      { keys: ["⌃w hjkl"], command: "pane_focus_left", description: "focus pane" },
      { keys: ["⌃w > / ⌃w <"], command: "pane_resize_grow", description: "grow / shrink width" },
      { keys: ["⌃w + / ⌃w -"], command: "pane_resize_grow_vertical", description: "grow / shrink height" },
      { keys: ["⌃w HJKL"], command: "pane_swap_left", description: "swap pane" },
      { keys: ["⌃w ⇥"], command: "pane_focus_next", description: "cycle panes" },
      { keys: ["⌃w o"], command: "pane_only", description: "close others" },
      { keys: ["⌃w q"], command: "pane_close", description: "close pane" },
      { keys: ["⌃w z"], command: "pane_zoom", description: "zoom pane" },
      { keys: ["⌃w ="], command: "pane_equalize", description: "equalize" },
    ],
  },
  {
    category: "System",
    items: [
      { keys: ["F", "⌃g", "⌘g"], command: "filter", description: "filter" },
      { keys: ["S", "⌘f"], command: "search_replace", description: "search & replace" },
      { keys: ["C", "c c", "⌘n"], command: "capture_dialog", description: "capture dialog" },
      { keys: [":", "⌃k", "⌘k"], command: "command_palette", description: "command palette" },
      { keys: ["/", "⌃f"], command: "local_find", description: "find on screen" },
      { keys: ["n / N"], command: "find_next", description: "find next / prev" },
      { keys: ["?"], command: "show_help", description: "help" },
      { keys: [",", "⌘,"], command: "settings", description: "settings" },
      { keys: ["`"], command: "console.toggle", description: "console" },
      { keys: ["q", "esc"], command: "quit", description: "quit" },
    ],
  },
]

// ── Verb x Location grid ──────────────────────────────────────────────

export const VERB_GRID: VerbGridRow[] = [
  // Board locations
  { key: "h", location: "home (@next)", goto: "g h", move: "m h" },
  { key: "i", location: "inbox", goto: "g i", move: "m i" },
  { key: "j", location: "journal", goto: "g j", move: "m j" },
  { key: "a", location: "archive", goto: "g a", move: "m a" },
  // Favorites (0-9) — bare 0-9 jumps directly, g 0-9 also works
  { key: "0-9", location: "favorites", goto: "g 0-9 / 0-9", separator: true },
  // Targets (pickers) — bare key is shortcut for a-prefix chord
  { key: "#", location: "tag", add: "a # / #", separator: true },
  { key: "@", location: "context", add: "a @ / @" },
  { key: "+", location: "project", goto: "g +", move: "m +", add: "a + / +" },
  { key: "[", location: "item", move: "m [", add: "a [" },
]

// ── Public API ────────────────────────────────────────────────────────

/** Return the static help sections array */
export function getHelpScreenData(): HelpSection[] {
  return HELP_SECTIONS
}
