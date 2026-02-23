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
      { keys: ["hjkl / ↑↓←→"], command: "cursor_down", description: "navigate" },
      { keys: ["z / Z"], command: "zoom_inwards", description: "zoom in/out" },
      { keys: ["gg / G"], command: "cursor_first", description: "top/bottom" },
      { keys: ["J K"], command: "block_nav_down", description: "move by block" },
      { keys: ["⌃u / ⌃d"], command: "page_up", description: "half page up/down" },
      { keys: ["{ / }"], command: "nav_back", description: "back/forward" },
      { keys: ["⌃j / ⌃k"], command: "sibling_board_next", description: "next/prev board" },
      { keys: ["↵"], command: "zoom_in", description: "zoom to cursor" },
      { keys: ["1-9"], command: "_favorites", description: "jump to board" },
    ],
  },
  {
    category: "Editing",
    items: [
      { keys: ["i / ↵"], command: "enter_inline_edit", description: "edit" },
      { keys: ["o / O"], command: "insert_below", description: "new item below/above" },
      { keys: ["n"], command: "new_item", description: "new item dialog" },
      { keys: ["⌫"], command: "delete_node", description: "delete" },
      { keys: ["⌘d"], command: "duplicate_node", description: "duplicate" },
      { keys: ["y / d / p ⌘c/x/v"], command: "clipboard_copy", description: "copy/cut/paste" },
      { keys: ["u / U"], command: "undo", description: "undo/redo" },
      { keys: ["⇥ / ⇧⇥"], command: "indent_node", description: "indent/outdent" },
      { keys: ["⌘↑↓←→"], command: "shift_up", description: "shift node" },
    ],
  },
  {
    category: "Selection",
    items: [
      { keys: ["v"], command: "visual_mode_enter", description: "visual mode" },
      { keys: ["␣"], command: "select_toggle", description: "toggle select" },
      { keys: ["A / ⌃a"], command: "select_all", description: "select all" },
      { keys: ["⇧↑↓←→"], command: "extend_select_up", description: "extend selection" },
    ],
  },
  {
    category: "Task",
    items: [
      { keys: ["x / X"], command: "toggle_task_done", description: "toggle/cycle status" },
      { keys: ["e"], command: "archive", description: "archive" },
      { keys: ["c C ⌘n"], command: "capture_inbox", description: "capture to inbox" },
      { keys: ["⌃t / t t"], command: "task_dialog", description: "task properties" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: ["H / L"], command: "fold_node", description: "fold/unfold" },
      { keys: ["< / >"], command: "fold_all", description: "fold/unfold all" },
      { keys: ["D ⌃i ⌘w"], command: "open_detail_pane", description: "detail pane" },
      { keys: ["⌘h / ⌘l"], command: "focus_board", description: "focus board/detail" },
      { keys: ["⌃↵"], command: "follow_link", description: "follow link" },
      { keys: ["+ / -"], command: "increase_content_lines", description: "show more/less" },
      { keys: ["g v"], command: "cycle_view_mode", description: "cycle view" },
      { keys: ["g c"], command: "toggle_collapse", description: "collapse column" },
      { keys: ["g C"], command: "toggle_show_ignored", description: "show ignored" },
      { keys: ["V"], command: "cycle_icon_style", description: "cycle icons" },
      { keys: ["?"], command: "show_help", description: "help" },
      { keys: ["⌘g / ⌃g"], command: "filter", description: "filter" },
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
      { keys: ["⌃w ⇥ ⇧⇥"], command: "pane_focus_next", description: "cycle panes" },
      { keys: ["⌃w o"], command: "pane_only", description: "close others" },
      { keys: ["⌃w c"], command: "pane_close", description: "close pane" },
      { keys: ["⌃w z"], command: "pane_zoom", description: "zoom pane" },
      { keys: ["⌃w ="], command: "pane_equalize", description: "equalize" },
    ],
  },
  {
    category: "System",
    items: [
      { keys: [": / ⌃k"], command: "command_palette", description: "command palette" },
      { keys: ["/"], command: "local_find", description: "find" },
      { keys: ["⌘f"], command: "search_replace", description: "find & replace" },
      { keys: ["⌘o / ⌘⇧o"], command: "open_in_system", description: "open in app/terminal" },
      { keys: ["`"], command: "console.toggle", description: "console" },
      { keys: ["⌘,"], command: "settings", description: "settings" },
      { keys: ["q / ⌘q"], command: "quit", description: "quit" },
    ],
  },
]

// ── Verb x Location grid ──────────────────────────────────────────────

export const VERB_GRID: VerbGridRow[] = [
  // Board locations
  { key: "/", location: "root", goto: "g /" },
  { key: "h", location: "home (next)", goto: "g h", move: "m h" },
  { key: "i", location: "inbox", goto: "g i", move: "m i" },
  { key: "j", location: "journal", goto: "g j", move: "m j" },
  { key: "e", location: "archive", goto: "g e", move: "m e", add: "a e" },
  // Targets
  { key: "p", location: "picker", goto: "g p", move: "m p", separator: true },
  { key: "[", location: "backlink", goto: "g [", add: "a [" },
  { key: "#", location: "tag", goto: "g #", add: "#" },
  { key: "@", location: "context", goto: "g @", add: "@" },
  { key: "+", location: "project", goto: "g +", move: "m +", add: "+" },
]

// ── Public API ────────────────────────────────────────────────────────

/** Return the static help sections array */
export function getHelpScreenData(): HelpSection[] {
  return HELP_SECTIONS
}
