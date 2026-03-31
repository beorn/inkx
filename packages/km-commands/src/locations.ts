/**
 * Repository Locations
 *
 * Well-known node IDs and dynamic location conventions for composable verbs.
 * Keybindings carry location templates (@inbox, journals/{YYYY}/..., {parent})
 * or resolvable references (fav:3) as targetId — no intermediate naming layer.
 *
 * System location values come from config (via favorites.ts initLocations).
 * REPO_LOCS is kept for backward compatibility but reads from the live store.
 */

import { getSystemLocation, SYSTEM_LOCATION_KEYS, getReservedKeyLabel } from "./favorites.ts"

/** Well-known repository location names. Reads from config store (live values). */
export const REPO_LOCS = {
  get home() {
    return getSystemLocation("h")!
  },
  get inbox() {
    return getSystemLocation("i")!
  },
  get journal() {
    return getSystemLocation("j")!
  },
  get archive() {
    return getSystemLocation("a")!
  },
} as const

/** Picker labels for pick:* targets */
const PICKER_LABELS: Record<string, string> = {
  "#": "tag",
  "@": "assignee",
  "+": "project",
  "[": "item",
}

/** Get display label for a targetId (sigil, template, fav:N, or pick:X) */
export function locationLabel(targetId: string): string {
  if (targetId.startsWith("fav:")) return `fav ${targetId.slice(4)}`
  if (targetId.startsWith("pick:")) return PICKER_LABELS[targetId.slice(5)] ?? targetId.slice(5)
  // Reverse-lookup: is this a system location's current value?
  for (const key of SYSTEM_LOCATION_KEYS) {
    if (getSystemLocation(key) === targetId) return getReservedKeyLabel(key) ?? key
  }
  return targetId.replace(/^@/, "")
}
