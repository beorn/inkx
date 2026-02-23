/**
 * TUI-specific commands
 *
 * Commands that are specific to the TUI application:
 * - Quit
 * - New item dialog
 * - Project picker
 * - Favorites (1-9)
 * - Column jump (Shift+1-9)
 * - Escape (contextual close/quit)
 * - Outdent
 */

import type { CommandDef, CommandAction } from "../types.ts"

/** Shift+number symbol for each digit 1-9 */
const SHIFT_NUMBER_SYMBOLS = ["!", "@", "#", "$", "%", "^", "&", "*", "("]

/** Generate favorite commands (1-9): jump to favorite board N via number key */
const favoriteCommands = ((): CommandDef[] =>
  Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    return {
      id: `favorite_${n}`,
      name: `Favorite ${n}`,
      description: `Jump to favorite board ${n}`,
      category: "Navigation",
      shortcuts: [`${n}`],
      execute: (): CommandAction => ({
        type: "JUMP_TO_FAVORITE",
        favoriteNumber: n,
      }),
    }
  }))()

/** Generate column jump commands (1-9): jump to column N via Shift+number */
const columnJumpCommands = ((): CommandDef[] =>
  Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    return {
      id: `column_${n}`,
      name: `Column ${n}`,
      description: `Jump to column ${n}`,
      category: "Navigation",
      shortcuts: [SHIFT_NUMBER_SYMBOLS[i] ?? ""],
      execute: (): CommandAction => ({
        type: "JUMP_TO_COLUMN",
        columnNumber: n,
      }),
    }
  }))()

export const tuiCommands: CommandDef[] = [
  // Quit
  {
    id: "quit",
    name: "Quit",
    description: "Exit the TUI",
    category: "View",
    shortcuts: ["q"],
    execute: (): CommandAction => ({ type: "QUIT" }),
  },

  // New item dialog
  {
    id: "new_item",
    name: "New Item",
    description: "Open new item dialog",
    category: "Edit",
    shortcuts: ["gn"],
    execute: (): CommandAction => ({ type: "SHOW_NEW_ITEM_DIALOG" }),
  },

  // Project picker
  {
    id: "project_picker",
    name: "Project Picker",
    description: "Open project picker",
    category: "Navigation",
    shortcuts: ["gp"],
    execute: (): CommandAction => ({ type: "SHOW_PROJECT_PICKER" }),
  },

  // Search dialog
  {
    id: "search",
    name: "Search",
    description: "Open search dialog",
    category: "Navigation",
    shortcuts: [],
    execute: (): CommandAction => ({ type: "SHOW_SEARCH_DIALOG" }),
  },

  // Favorites (1-9)
  ...favoriteCommands,

  // Column jump (Shift+1-9)
  ...columnJumpCommands,

  // Close/Quit (contextual Escape)
  {
    id: "close_or_quit",
    name: "Close/Quit",
    description: "Close current dialog/pane, or quit if nothing to close",
    category: "View",
    shortcuts: ["Escape"],
    execute: (): CommandAction => ({ type: "CLOSE_OR_QUIT" }),
  },

  // Outdent (Shift+Tab)
  {
    id: "outdent",
    name: "Outdent",
    description: "Move item to parent level",
    category: "Edit",
    shortcuts: ["Shift+Tab"],
    execute: (): CommandAction => ({ type: "OUTDENT_NODE" }),
  },

  // === Modal commands ===

  // Help overlay
  {
    id: "help.dismiss",
    name: "Dismiss Help",
    description: "Close help overlay",
    category: "View",
    shortcuts: ["?", "Escape", "q"],
    execute: (): CommandAction => ({ type: "HIDE_HELP" }),
  },
  {
    id: "help.scroll_up",
    name: "Help Scroll Up",
    description: "Scroll help overlay up",
    category: "View",
    shortcuts: ["k", "ArrowUp"],
    execute: (): CommandAction => ({ type: "HELP_SCROLL_UP" }),
  },
  {
    id: "help.scroll_down",
    name: "Help Scroll Down",
    description: "Scroll help overlay down",
    category: "View",
    shortcuts: ["j", "ArrowDown"],
    execute: (): CommandAction => ({ type: "HELP_SCROLL_DOWN" }),
  },

  // Delete confirmation
  {
    id: "delete_confirm.confirm",
    name: "Confirm Delete",
    description: "Execute pending deletion",
    category: "Edit",
    shortcuts: ["Enter"],
    execute: (): CommandAction => ({ type: "DELETE_CONFIRM_EXECUTE" }),
  },
  {
    id: "delete_confirm.cancel",
    name: "Cancel Delete",
    description: "Cancel pending deletion",
    category: "Edit",
    execute: (): CommandAction => ({ type: "DELETE_CONFIRM_CANCEL" }),
  },

  // Console
  {
    id: "console.close",
    name: "Close Console",
    description: "Close console overlay",
    category: "View",
    shortcuts: ["Escape", "`"],
    execute: (): CommandAction => ({ type: "CONSOLE_CLOSE" }),
  },
  {
    id: "console.toggle",
    name: "Toggle Console",
    description: "Toggle console overlay",
    category: "View",
    shortcuts: ["`"],
    execute: (): CommandAction => ({ type: "CONSOLE_TOGGLE" }),
  },

  // Sync Pane
  {
    id: "sync_pane.toggle",
    name: "Toggle Sync Pane",
    description: "Toggle sync activity pane",
    category: "View",
    shortcuts: ["S"],
    execute: (): CommandAction => ({ type: "SYNC_PANE_TOGGLE" }),
  },

  // Toggle hide done/dropped tasks
  {
    id: "toggle_hide_done",
    name: "Toggle Hide Done",
    description: "Toggle hiding done and dropped tasks",
    category: "View",
    shortcuts: ["tc"],
    execute: (): CommandAction => ({ type: "TOGGLE_HIDE_DONE" }),
  },

  // Toast
  {
    id: "toast.dismiss",
    name: "Dismiss Toast",
    description: "Dismiss active toast notification",
    category: "View",
    shortcuts: ["Escape"],
    execute: (): CommandAction => ({ type: "TOAST_DISMISS" }),
  },

  // Task dialog (Cmd+T / tt — v2 spec)
  {
    id: "task_dialog",
    name: "Task Dialog",
    description: "Open task properties dialog",
    category: "Edit",
    shortcuts: ["Cmd+T", "tt"],
    execute: (): CommandAction => ({ type: "SHOW_TASK_DIALOG" }),
  },

  // Noop — absorb key without action
  {
    id: "noop",
    name: "No-op",
    description: "Absorb key without action",
    category: "View",
    execute: (): CommandAction => ({ type: "NOOP" }),
  },

  // Local find (inline search bar)
  {
    id: "local_find",
    name: "Find",
    description: "Open inline find bar",
    category: "Navigation",
    shortcuts: ["/", "Ctrl+F"],
    execute: (): CommandAction => ({ type: "LOCAL_FIND_OPEN" }),
  },
  {
    id: "find_next",
    name: "Find Next",
    description: "Go to next match",
    category: "Navigation",
    shortcuts: ["n"],
    execute: (): CommandAction => ({ type: "LOCAL_FIND_NEXT" }),
  },
  {
    id: "find_prev",
    name: "Find Previous",
    description: "Go to previous match",
    category: "Navigation",
    shortcuts: ["N"],
    execute: (): CommandAction => ({ type: "LOCAL_FIND_PREV" }),
  },
  {
    id: "find_close",
    name: "Close Find",
    description: "Close find bar and clear search",
    category: "Navigation",
    shortcuts: ["Escape"],
    execute: (): CommandAction => ({ type: "LOCAL_FIND_CLOSE" }),
  },
  {
    id: "find_confirm",
    name: "Confirm Find",
    description: "Close find bar but keep cursor on match",
    category: "Navigation",
    shortcuts: ["Enter"],
    execute: (): CommandAction => ({ type: "LOCAL_FIND_CONFIRM" }),
  },

  // Search & replace dialog
  {
    id: "search_replace",
    name: "Search & Replace",
    description: "Open search and replace dialog",
    category: "Edit",
    shortcuts: ["F", "Cmd+F"],
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_OPEN" }),
  },
  {
    id: "search_replace.close",
    name: "Close Search & Replace",
    description: "Close search and replace dialog",
    category: "Edit",
    shortcuts: ["Escape"],
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_CLOSE" }),
  },
  {
    id: "search_replace.next",
    name: "Search Replace Next",
    description: "Go to next search match",
    category: "Edit",
    shortcuts: ["Enter"],
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_NEXT" }),
  },
  {
    id: "search_replace.prev",
    name: "Search Replace Previous",
    description: "Go to previous search match",
    category: "Edit",
    shortcuts: ["Shift+Enter"],
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_PREV" }),
  },
  {
    id: "search_replace.replace",
    name: "Replace",
    description: "Replace current match",
    category: "Edit",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_DO_REPLACE" }),
  },
  {
    id: "search_replace.replace_all",
    name: "Replace All",
    description: "Replace all matches",
    category: "Edit",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_DO_REPLACE_ALL" }),
  },
  {
    id: "search_replace.toggle_regex",
    name: "Toggle Regex",
    description: "Toggle regex mode for search",
    category: "Edit",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_TOGGLE_REGEX" }),
  },
  {
    id: "search_replace.tab_field",
    name: "Switch Field",
    description: "Switch between search and replace fields",
    category: "Edit",
    shortcuts: ["Tab"],
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_TAB_FIELD" }),
  },
]
