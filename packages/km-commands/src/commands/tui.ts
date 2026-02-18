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
    shortcuts: ["n"],
    execute: (): CommandAction => ({ type: "SHOW_NEW_ITEM_DIALOG" }),
  },

  // Project picker
  {
    id: "project_picker",
    name: "Project Picker",
    description: "Open project picker",
    category: "Navigation",
    shortcuts: ["p"],
    execute: (): CommandAction => ({ type: "SHOW_PROJECT_PICKER" }),
  },

  // Search dialog
  {
    id: "search",
    name: "Search",
    description: "Open search dialog",
    category: "Navigation",
    shortcuts: ["/"],
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
    shortcuts: ["D"],
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

  // Dev
  {
    id: "dev.test_toast",
    name: "Test Toast",
    description: "Fire a random test toast (dev)",
    category: "View",
    shortcuts: ["Ctrl+T"],
    execute: (): CommandAction => ({ type: "DEV_TEST_TOAST" }),
  },

  // Noop — absorb key without action
  {
    id: "noop",
    name: "No-op",
    description: "Absorb key without action",
    category: "View",
    execute: (): CommandAction => ({ type: "NOOP" }),
  },
]
