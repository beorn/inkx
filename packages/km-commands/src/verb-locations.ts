/**
 * Verb × Location Composable Vocabulary
 *
 * Generates keybindings from the cross-product of verbs (goto, move, add, create)
 * and locations (inbox, journal, home, archive, favorites, pickers).
 *
 * Each verb constructor takes a locationKey string and returns an Execute function.
 * The grid helper generates Keybinding objects from the cross-product.
 */

import type { CommandContext, CommandAction } from "./types.ts"
import type { Keybinding, KeybindingContext } from "./keybindings.ts"
import type { WhenPredicate } from "./when.ts"
import { hasKitty } from "./when.ts"
import { REPO_LOCS } from "./locations.ts"
import { getAllFavorites } from "./favorites.ts"

// --- Verb Constructors ---
// Functions that take a locationKey and return a command execute function

export type Execute = (ctx: CommandContext) => CommandAction | CommandAction[] | null

/** Go to a target (navigates there) */
export const goTo =
  (locationKey: string): Execute =>
  () => {
    if (locationKey.startsWith("pick:")) return { type: "SHOW_ITEM_PICKER" } // pickers stay for now
    return { type: "CURSOR_TO", locationKey }
  }

/** Move selected node(s) to a target */
export const moveTo =
  (locationKey: string): Execute =>
  () => ({ type: "REPARENT_TO", locationKey })

/** Add a link/property to a target */
export const addTo =
  (locationKey: string): Execute =>
  () => ({ type: "LINK_TO", locationKey })

/** Create in a target (capture) */
export const createIn =
  (locationKey: string): Execute =>
  () => ({ type: "CREATE_AT", locationKey })

// --- Location and Verb Registries ---

/** System locations — hardcoded, always available */
export const SYSTEM_LOCS: Record<string, { key: string; label: string }> = {
  h: { key: REPO_LOCS.home, label: "home" },
  i: { key: REPO_LOCS.inbox, label: "inbox" },
  j: { key: REPO_LOCS.journal, label: "journal" },
  a: { key: REPO_LOCS.archive, label: "archive" },
  p: { key: "parent", label: "parent" },
  g: { key: "first", label: "first" },
  "shift-g": { key: "last", label: "last" }, // G (shift+g)
}

/** Picker locations */
export const PICKER_LOCS: Record<string, { key: string; label: string }> = {
  "shift-3": { key: "pick:#", label: "tag" }, // #
  "shift-2": { key: "pick:@", label: "assignee" }, // @
  "shift-=": { key: "pick:+", label: "project" }, // +
  "[": { key: "pick:[", label: "item" },
}

/** Verb definitions used in the grid */
export interface VerbDef {
  prefix: string
  commandId: string
  fn: (locationKey: string) => Execute
  label: string
}

export const VERBS: Record<string, VerbDef> = {
  g: { prefix: "g", commandId: "goto", fn: goTo, label: "Go to" },
  m: { prefix: "m", commandId: "move", fn: moveTo, label: "Move to" },
  a: { prefix: "a", commandId: "add", fn: addTo, label: "Add to" },
  c: { prefix: "c", commandId: "create_in", fn: createIn, label: "Create in" },
}

/** Generate chord keybindings from verb x location cross-product.
 *  @param prefixes — if provided, only generate bindings for these verb prefixes (e.g., ["g", "m"]) */
export function verbLocationGrid(prefixes?: string[]): Keybinding[] {
  const bindings: Keybinding[] = []

  for (const [vKey, verb] of Object.entries(VERBS)) {
    if (prefixes && !prefixes.includes(vKey)) continue
    // System locations
    for (const [lKey, loc] of Object.entries(SYSTEM_LOCS)) {
      // Skip combos that don't make sense
      // g g -> first, g shift-g -> last are special (cursor movement, not goto board)
      // m g -> first, m shift-g -> last are shift-to-top/bottom
      // a g, a shift-g, a p -> don't make sense
      // c only makes sense with inbox (c i)
      if (vKey === "a" && (lKey === "g" || lKey === "shift-g" || lKey === "p")) continue
      if (vKey === "c" && lKey !== "i") continue

      bindings.push({
        key: `${verb.prefix} ${lKey}`,
        commandId: verb.commandId,
        targetId: loc.key,
        execute: verb.fn(loc.key),
      })
    }

    // Favorites — for all verbs except c (create)
    if (vKey !== "c") {
      for (const [favKey] of getAllFavorites()) {
        const locationKey = `fav:${favKey}`
        bindings.push({
          key: `${verb.prefix} ${favKey}`,
          commandId: verb.commandId,
          targetId: locationKey,
          execute: verb.fn(locationKey),
        })
      }
    }

    // Picker locations — for verbs that support them
    for (const [pKey, ploc] of Object.entries(PICKER_LOCS)) {
      if (vKey === "c" && pKey !== "#") continue // c # is useful (create + label)
      bindings.push({
        key: `${verb.prefix} ${pKey}`,
        commandId: verb.commandId,
        targetId: ploc.key,
        execute: verb.fn(ploc.key),
      })
    }
  }

  return bindings
}

/** Ctrl chord config: maps verb prefix → { ctrlKey, when? } */
const CTRL_CHORDS: Record<string, { when?: WhenPredicate | ((ctx: KeybindingContext) => boolean) }> = {
  g: {},
  m: { when: hasKitty as WhenPredicate | ((ctx: KeybindingContext) => boolean) },
}

/** Generate Ctrl+prefix chord variants (alternative chord prefixes for Kitty terminals) */
export function ctrlVerbLocationGrid(): Keybinding[] {
  const prefixes = Object.keys(CTRL_CHORDS)
  const grid = verbLocationGrid(prefixes)
  const ctrlBindings: Keybinding[] = []

  for (const b of grid) {
    const spaceIdx = b.key.indexOf(" ")
    const chord = spaceIdx > 0 ? b.key.slice(0, spaceIdx) : ""
    const suffix = spaceIdx > 0 ? b.key.slice(spaceIdx + 1) : b.key
    const config = CTRL_CHORDS[chord]
    if (!config) continue
    ctrlBindings.push({ ...b, key: `Ctrl+${chord} ${suffix}`, ...config })
  }

  return ctrlBindings
}
