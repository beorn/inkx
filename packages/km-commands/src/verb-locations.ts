/**
 * Verb × Location Composable Vocabulary
 *
 * Generates keybindings from the cross-product of verbs (goto, move, add, create)
 * and locations (inbox, journal, home, archive, favorites, pickers).
 *
 * Each verb constructor takes a target resolver and returns an Execute function.
 * The grid helper generates Keybinding objects from the cross-product.
 */

import type { CommandContext, CommandAction } from "./types.ts"
import type { Keybinding, KeybindingContext } from "./keybindings.ts"
import type { WhenPredicate } from "./when.ts"
import { hasKitty } from "./when.ts"
import { REPO_LOCS } from "./locations.ts"

// --- Target Resolvers ---
// Functions that resolve a target nodeId from context

export type TargetResolver = (ctx: CommandContext) => string | null

// Constant targets — always resolve to the same node
export const inbox: TargetResolver = () => REPO_LOCS.inbox // "@inbox"
export const journal: TargetResolver = () => REPO_LOCS.journal // "@journal"
export const home: TargetResolver = () => REPO_LOCS.home // "@next"
export const archive: TargetResolver = () => REPO_LOCS.archive // "@archive"

// Positional targets — resolve from ctx
export const parent: TargetResolver = () => "parent"
export const first: TargetResolver = () => "first"
export const last: TargetResolver = () => "last"

// Favorite target factory
export const fav =
  (n: number): TargetResolver =>
  () =>
    `fav:${n}`

// Picker target factory — return marker strings the TUI interprets
export const pick =
  (prefix: string): TargetResolver =>
  () =>
    `pick:${prefix}`

// --- Verb Constructors ---
// Functions that take a target resolver and return a command execute function

export type Execute = (ctx: CommandContext) => CommandAction | CommandAction[] | null

/** Go to a target (navigates there) */
export const goTo =
  (target: TargetResolver): Execute =>
  (ctx) => {
    const t = target(ctx)
    if (!t) return null
    // Delegate to existing goto command logic
    if (t === "parent") return { type: "ZOOM_OUTWARDS" }
    if (t.startsWith("fav:")) return { type: "JUMP_TO_FAVORITE", favoriteNumber: Number(t.slice(4)) }
    if (t.startsWith("pick:")) return { type: "SHOW_PROJECT_PICKER" }
    return { type: "GOTO_BOARD", boardId: t }
  }

/** Move selected node(s) to a target */
export const moveTo =
  (target: TargetResolver): Execute =>
  (ctx) => {
    const t = target(ctx)
    if (!t) return null
    if (t === "parent") return { type: "OUTDENT_NODE" }
    if (t === "first") return { type: "SHIFT_TO_TOP" }
    if (t === "last") return { type: "SHIFT_TO_BOTTOM" }
    if (t.startsWith("fav:")) return { type: "MOVE_TO_FAVORITE", favoriteNumber: Number(t.slice(4)) }
    if (t.startsWith("pick:")) return { type: "REPARENT_PICKER" }
    return { type: "MOVE_TO_BOARD", boardId: t }
  }

/** Add a link/property to a target */
export const addTo =
  (target: TargetResolver): Execute =>
  (ctx) => {
    const t = target(ctx)
    if (!t) return null
    if (t === "pick:#") return { type: "SET_LABEL" }
    if (t === "pick:@") return { type: "SET_ASSIGNEE" }
    if (t === "pick:+") return { type: "REPARENT_PICKER" }
    if (t === "pick:[") return { type: "ADD_LINK" }
    if (t.startsWith("fav:")) return { type: "ADD_LINK_TO_FAVORITE", favoriteNumber: Number(t.slice(4)) }
    return { type: "ADD_LINK_TO_BOARD", boardId: t }
  }

/** Create in a target (capture) */
export const createIn =
  (_target: TargetResolver): Execute =>
  (_ctx) => {
    // For now, capture dialog is the only create verb
    return { type: "CAPTURE_DIALOG" }
  }

// --- Location and Verb Registries ---

/** System locations — hardcoded, always available */
export const SYSTEM_LOCS: Record<string, { resolve: TargetResolver; label: string }> = {
  h: { resolve: home, label: "home" },
  i: { resolve: inbox, label: "inbox" },
  j: { resolve: journal, label: "journal" },
  a: { resolve: archive, label: "archive" },
  p: { resolve: parent, label: "parent" },
  g: { resolve: first, label: "first" },
  G: { resolve: last, label: "last" },
}

/** Picker locations */
export const PICKER_LOCS: Record<string, { resolve: TargetResolver; label: string }> = {
  "#": { resolve: pick("#"), label: "tag" },
  "@": { resolve: pick("@"), label: "assignee" },
  "+": { resolve: pick("+"), label: "project" },
  "[": { resolve: pick("["), label: "item" },
}

/** Verb definitions used in the grid */
export interface VerbDef {
  prefix: string
  commandId: string
  fn: (target: TargetResolver) => Execute
  label: string
}

export const VERBS: Record<string, VerbDef> = {
  g: { prefix: "g", commandId: "goto", fn: goTo, label: "Go to" },
  m: { prefix: "m", commandId: "move", fn: moveTo, label: "Move to" },
  a: { prefix: "a", commandId: "add", fn: addTo, label: "Add to" },
  c: { prefix: "c", commandId: "create_in", fn: createIn, label: "Create in" },
}

/** Generate chord keybindings from verb x location cross-product */
export function verbLocationGrid(): Keybinding[] {
  const bindings: Keybinding[] = []

  for (const [vKey, verb] of Object.entries(VERBS)) {
    // System locations
    for (const [lKey, loc] of Object.entries(SYSTEM_LOCS)) {
      // Skip combos that don't make sense
      // g g -> first, g G -> last are special (cursor movement, not goto board)
      // m g -> first, m G -> last are shift-to-top/bottom
      // a g, a G, a p -> don't make sense
      // c only makes sense with inbox (c i)
      if (vKey === "a" && (lKey === "g" || lKey === "G" || lKey === "p")) continue
      if (vKey === "c" && lKey !== "i") continue

      bindings.push({
        chord: verb.prefix,
        key: lKey,
        commandId: verb.commandId,
        targetId: loc.resolve({} as CommandContext) ?? undefined,
        execute: verb.fn(loc.resolve),
      })
    }

    // Favorites (0-9) — for all verbs except c (create)
    if (vKey !== "c") {
      for (let n = 0; n <= 9; n++) {
        bindings.push({
          chord: verb.prefix,
          key: String(n),
          commandId: verb.commandId,
          targetId: `fav:${n}`,
          execute: verb.fn(fav(n)),
        })
      }
    }

    // Picker locations — for verbs that support them
    for (const [pKey, ploc] of Object.entries(PICKER_LOCS)) {
      if (vKey === "c" && pKey !== "#") continue // c # is useful (create + label)
      bindings.push({
        chord: verb.prefix,
        key: pKey,
        commandId: verb.commandId,
        targetId: ploc.resolve({} as CommandContext) ?? undefined,
        execute: verb.fn(ploc.resolve),
      })
    }
  }

  return bindings
}

/** Generate Ctrl+prefix chord variants (alternative chord prefixes for Kitty terminals) */
export function ctrlVerbLocationGrid(): Keybinding[] {
  const grid = verbLocationGrid()
  const ctrlBindings: Keybinding[] = []

  for (const b of grid) {
    if (b.chord === "g") {
      ctrlBindings.push({ ...b, chord: "Ctrl+g" })
    }
    if (b.chord === "m") {
      ctrlBindings.push({
        ...b,
        chord: "Ctrl+m",
        when: hasKitty as WhenPredicate | ((ctx: KeybindingContext) => boolean),
      })
    }
  }

  return ctrlBindings
}
