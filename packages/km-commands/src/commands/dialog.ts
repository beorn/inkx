/**
 * Dialog commands
 *
 * Commands for dialog navigation (up/down, confirm, cancel).
 * These are routed via when predicates that check dialog state.
 */

import type { CommandDef, CommandAction, FilterCategory } from "../types.ts"

export const dialogCommands: CommandDef[] = [
  {
    id: "dialog.nav_up",
    name: "Dialog Navigate Up",
    description: "Move selection up in dialog",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_NAV_UP" }),
  },
  {
    id: "dialog.nav_down",
    name: "Dialog Navigate Down",
    description: "Move selection down in dialog",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_NAV_DOWN" }),
  },
  {
    id: "dialog.confirm",
    name: "Dialog Confirm",
    description: "Confirm dialog selection",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_CONFIRM" }),
  },
  {
    id: "dialog.cancel",
    name: "Dialog Cancel",
    description: "Cancel and close dialog",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_CANCEL" }),
  },
  {
    id: "dialog.toggle_search_scope",
    name: "Toggle Search Scope",
    description: "Toggle search scope between All and Selected",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "TOGGLE_SEARCH_SCOPE" }),
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
 * Press 'a' to start assigning, then press a key to capture it.
 * favorites.assign uses the raw pressed key (injected by routeThroughCommandSystem).
 * favorites.clear removes the favorite at the current cursor position.
 */
export const favoritesDialogCommands: CommandDef[] = [
  {
    id: "favorites.start_assign",
    name: "Start Assign Favorite",
    description: "Enter key capture mode to assign current node",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FAVORITES_START_ASSIGN" }),
  },
  {
    id: "favorites.assign",
    name: "Assign Favorite",
    description: "Assign current node to the pressed key",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FAVORITES_ASSIGN", key: "" }), // key injected by caller
  },
  {
    id: "favorites.cancel_assign",
    name: "Cancel Assign",
    description: "Cancel key capture mode",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FAVORITES_CANCEL_ASSIGN" }),
  },
  {
    id: "favorites.clear",
    name: "Clear Favorite",
    description: "Remove the favorite at cursor",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "FAVORITES_CLEAR" }),
  },
]

export const filterDialogCommands: CommandDef[] = [
  {
    id: "filter.nav_left",
    name: "Filter Navigate Left",
    description: "Move to previous filter option",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_NAV_LEFT" }),
  },
  {
    id: "filter.nav_right",
    name: "Filter Navigate Right",
    description: "Move to next filter option",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "DIALOG_NAV_RIGHT" }),
  },
  {
    id: "filter.clear_all",
    name: "Clear All Filters",
    description: "Clear all active filters",
    category: "Navigation",
    execute: (): CommandAction => ({ type: "CLEAR_ALL_FILTER_PROPERTIES" }),
  },
]
