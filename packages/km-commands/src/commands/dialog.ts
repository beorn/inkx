/**
 * Dialog commands
 *
 * Commands for dialog navigation (up/down, confirm, cancel).
 * These are routed via when predicates that check dialog state.
 */

import type { CommandDef, KmOp } from "../types.ts"

export const dialogCommands: CommandDef[] = [
  {
    id: "dialog.nav_up",
    name: "Dialog Navigate Up",
    description: "Move selection up in dialog",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_NAV_UP" }),
  },
  {
    id: "dialog.nav_down",
    name: "Dialog Navigate Down",
    description: "Move selection down in dialog",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_NAV_DOWN" }),
  },
  {
    id: "dialog.confirm",
    name: "Dialog Confirm",
    description: "Confirm dialog selection",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_CONFIRM" }),
  },
  {
    id: "dialog.cancel",
    name: "Dialog Cancel",
    description: "Cancel and close dialog",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_CANCEL" }),
  },
  {
    id: "dialog.toggle_search_scope",
    name: "Toggle Search Scope",
    description: "Toggle search scope between All and Selected",
    category: "Navigation",
    execute: (): KmOp => ({ type: "TOGGLE_SEARCH_SCOPE" }),
  },
]

/**
 * Filter dialog commands
 *
 * Navigation and toggle commands specific to the filter panel.
 * These use DIALOG_NAV_UP/DOWN for row navigation and DIALOG_CONFIRM for toggle.
 * h/l and clear operations dispatch filter-specific actions.
 */
/**
 * Favorites dialog commands
 *
 * "Key first, then action" flow:
 * 1. M opens dialog showing all favorites (read-only list)
 * 2. Press any key → favorites.select_key → detail view for that key
 * 3. Enter → assign cursor node, Delete/Backspace → clear, Esc → back to list
 */
export const favoritesDialogCommands: CommandDef[] = [
  {
    id: "favorites.select_key",
    name: "Select Favorite Key",
    description: "Select a key to view/assign/clear",
    category: "Navigation",
    execute: (): KmOp => ({ type: "FAVORITES_SELECT_KEY", key: "" }), // key injected by caller
  },
  {
    id: "favorites.assign",
    name: "Assign Favorite",
    description: "Assign cursor node to the selected key",
    category: "Navigation",
    execute: (): KmOp => ({ type: "FAVORITES_ASSIGN" }),
  },
  {
    id: "favorites.clear",
    name: "Clear Favorite",
    description: "Clear the selected favorite",
    category: "Navigation",
    execute: (): KmOp => ({ type: "FAVORITES_CLEAR" }),
  },
  {
    id: "favorites.back",
    name: "Back to Favorites List",
    description: "Return to favorites list from detail view",
    category: "Navigation",
    execute: (): KmOp => ({ type: "FAVORITES_BACK" }),
  },
]

export const filterDialogCommands: CommandDef[] = [
  {
    id: "filter.nav_left",
    name: "Filter Navigate Left",
    description: "Move to previous filter option",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_NAV_LEFT" }),
  },
  {
    id: "filter.nav_right",
    name: "Filter Navigate Right",
    description: "Move to next filter option",
    category: "Navigation",
    execute: (): KmOp => ({ type: "DIALOG_NAV_RIGHT" }),
  },
  {
    id: "filter.clear_all",
    name: "Clear All Filters",
    description: "Clear all active filters",
    category: "Navigation",
    execute: (): KmOp => ({ type: "CLEAR_ALL_FILTER_PROPERTIES" }),
  },
]
