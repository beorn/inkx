/**
 * TUI-specific commands
 *
 * Commands that are specific to the TUI application:
 * - Quit
 * - New item dialog
 * - Project picker
 * - Column jump (Shift+1-9)
 * - Escape (contextual close/quit)
 * - Outdent
 */

import type { CommandDef, CommandAction } from "../types.ts"

/** Generate column jump commands (1-9): jump to column N via Shift+number */
// ORPHAN: no keybinding — column_1..column_9 are not wired in keybindings.ts
const columnJumpCommands = ((): CommandDef[] =>
  Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    return {
      id: `column_${n}`,
      name: `Column ${n}`,
      description: `Jump to column ${n}`,
      category: "Navigation",
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
    shortLabel: "quit",
    execute: (): CommandAction => ({ type: "QUIT" }),
  },

  // New item dialog
  {
    id: "new_item",
    name: "New Item",
    description: "Open new item dialog",
    category: "Edit",
    shortLabel: "new",
    execute: (): CommandAction => ({ type: "SHOW_NEW_ITEM_DIALOG" }),
  },

  // Item picker (project mode — move card to a project)
  {
    id: "item_picker",
    name: "Item Picker",
    description: "Open item picker (project/tag/assignee)",
    category: "Navigation",
    shortLabel: "project",
    execute: (): CommandAction => ({ type: "SHOW_ITEM_PICKER" }),
  },

  // Search dialog
  // ORPHAN: no keybinding — superseded by local_find (/) in keybindings.ts
  {
    id: "search",
    name: "Search",
    description: "Open search dialog",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "SHOW_SEARCH_DIALOG" }),
  },

  // Column jump (Shift+1-9)
  ...columnJumpCommands,

  // Close/Quit (contextual Escape)
  {
    id: "close_or_quit",
    name: "Close/Quit",
    description: "Close current dialog/pane, or quit if nothing to close",
    category: "View",
    shortLabel: "close",
    execute: (): CommandAction => ({ type: "CLOSE_OR_QUIT" }),
  },

  // Outdent (Shift+Tab)
  {
    id: "outdent",
    name: "Outdent",
    description: "Move item to parent level",
    category: "Edit",
    execute: (): CommandAction => ({ type: "OUTDENT_NODE" }),
  },

  // === Modal commands ===

  // Help overlay
  {
    id: "help.dismiss",
    name: "Dismiss Help",
    description: "Close help overlay",
    category: "View",
    execute: (): CommandAction => ({ type: "HIDE_HELP" }),
  },
  {
    id: "help.scroll_up",
    name: "Help Scroll Up",
    description: "Scroll help overlay up",
    category: "View",
    execute: (): CommandAction => ({ type: "HELP_SCROLL_UP" }),
  },
  {
    id: "help.scroll_down",
    name: "Help Scroll Down",
    description: "Scroll help overlay down",
    category: "View",
    execute: (): CommandAction => ({ type: "HELP_SCROLL_DOWN" }),
  },

  // Delete confirmation
  {
    id: "delete_confirm.confirm",
    name: "Confirm Delete",
    description: "Execute pending deletion",
    category: "Edit",
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
    execute: (): CommandAction => ({ type: "CONSOLE_CLOSE" }),
  },
  {
    id: "console.toggle",
    name: "Toggle Console",
    description: "Toggle console overlay",
    category: "View",
    shortLabel: "console",
    execute: (): CommandAction => ({ type: "CONSOLE_TOGGLE" }),
  },

  // Toggle hide done/dropped tasks
  {
    id: "toggle_hide_done",
    name: "Toggle Hide Done",
    description: "Toggle hiding done and dropped tasks",
    category: "View",
    shortLabel: "done",
    execute: (): CommandAction => ({ type: "TOGGLE_HIDE_DONE" }),
  },

  // Toast
  {
    id: "toast.dismiss",
    name: "Dismiss Toast",
    description: "Dismiss active toast notification",
    category: "View",
    execute: (): CommandAction => ({ type: "TOAST_DISMISS" }),
  },

  // Dev
  {
    id: "dev.test_toast",
    name: "Test Toast",
    description: "Fire a random test toast (dev)",
    category: "View",
    execute: (): CommandAction => ({ type: "DEV_TEST_TOAST" }),
  },

  // Task dialog (Cmd+T / tt — v2 spec)
  {
    id: "task_dialog",
    name: "Task Dialog",
    description: "Open task properties dialog",
    category: "Edit",
    shortLabel: "task",
    execute: (): CommandAction => ({ type: "SHOW_TASK_DIALOG" }),
  },

  // Noop — absorb key without action
  {
    id: "noop",
    name: "No-op",
    description: "Absorb key without action",
    category: "View",
    shortLabel: "...",
    execute: (): CommandAction => ({ type: "NOOP" }),
  },

  // Local find (inline search bar)
  {
    id: "local_find",
    name: "Find",
    description: "Open inline find bar",
    category: "Navigation",
    shortLabel: "find",
    execute: (): CommandAction => ({ type: "LOCAL_FIND_OPEN" }),
  },
  {
    id: "find_next",
    name: "Find Next",
    description: "Go to next match",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "LOCAL_FIND_NEXT" }),
  },
  {
    id: "find_prev",
    name: "Find Previous",
    description: "Go to previous match",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "LOCAL_FIND_PREV" }),
  },
  {
    id: "find_close",
    name: "Close Find",
    description: "Close find bar and clear search",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "LOCAL_FIND_CLOSE" }),
  },
  {
    id: "find_confirm",
    name: "Confirm Find",
    description: "Close find bar but keep cursor on match",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "LOCAL_FIND_CONFIRM" }),
  },

  // Search & replace dialog
  {
    id: "search_replace",
    name: "Search & Replace",
    description: "Open search and replace dialog",
    category: "Edit",
    shortLabel: "search",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_OPEN" }),
  },
  {
    id: "search_replace.close",
    name: "Close Search & Replace",
    description: "Close search and replace dialog",
    category: "Edit",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_CLOSE" }),
  },
  {
    id: "search_replace.next",
    name: "Search Replace Next",
    description: "Go to next search match",
    category: "Edit",
    execute: (): CommandAction => ({ type: "SEARCH_REPLACE_NEXT" }),
  },
  {
    id: "search_replace.prev",
    name: "Search Replace Previous",
    description: "Go to previous search match",
    category: "Edit",
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
    id: "focus_next",
    name: "Focus Next",
    description: "Move focus to next control",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FOCUS_NEXT" }),
  },
  {
    id: "focus_prev",
    name: "Focus Previous",
    description: "Move focus to previous control",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FOCUS_PREV" }),
  },
]
