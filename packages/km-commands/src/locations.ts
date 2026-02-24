/**
 * Location Targets for Composable Verbs
 *
 * Maps target keys to board IDs for goto/move verbs, and to action types
 * for the add verb. Labels used by WhichKeyPopup for display.
 */
import type { CommandAction } from "./types.ts"

/** Well-known board targets for goto/move verbs */
export const BOARD_LOCATIONS: Record<string, string> = {
  h: "@next", // home
  i: "@inbox",
  j: "@journal",
  a: "@archive",
}

/** Action types for add verb targets (pickers that operate on current node) */
export const ADD_TARGETS: Record<string, CommandAction> = {
  "#": { type: "SET_LABEL" },
  "@": { type: "SET_ASSIGNEE" },
  "+": { type: "REPARENT_PICKER" },
  "[": { type: "ADD_LINK" },
}

/** Display labels for which-key popup */
const LOCATION_LABELS: Record<string, string> = {
  h: "home",
  i: "inbox",
  j: "journal",
  a: "archive",
  "#": "tag",
  "@": "assignee",
  "+": "project",
  "[": "item",
}

/** Get display label for a location target key */
export function locationLabel(target: string): string {
  if (LOCATION_LABELS[target]) return LOCATION_LABELS[target]
  if (/^\d$/.test(target)) return `fav ${target}`
  return target
}
