/**
 * Dialog commands
 *
 * Commands for dialog navigation (up/down, confirm, cancel).
 * These are routed via when predicates that check dialog state.
 */

import type { CommandDef, CommandAction } from "../types.ts"

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
