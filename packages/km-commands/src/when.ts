/**
 * Named When Predicates
 *
 * Function + label in one object for keybinding conditions.
 * Inspired by VS Code's ContextKeyService but using typed functions
 * instead of parsed string expressions.
 */

import type { KeybindingContext } from "./keybindings.ts"

/**
 * A named predicate for keybinding conditions.
 * Callable as a function, with a `.label` for introspection/help display.
 */
export interface WhenPredicate {
  (ctx: KeybindingContext): boolean
  label: string
}

/** Create a named predicate */
export function when(
  label: string,
  fn: (ctx: KeybindingContext) => boolean,
): WhenPredicate {
  return Object.assign(fn, { label })
}

/** Negate a predicate */
export function not(pred: WhenPredicate): WhenPredicate {
  return when(`!${pred.label}`, (ctx) => !pred(ctx))
}

/** Combine predicates with AND */
export function and(...preds: WhenPredicate[]): WhenPredicate {
  return when(preds.map((p) => p.label).join(" && "), (ctx) =>
    preds.every((p) => p(ctx)),
  )
}

// === Pre-built predicates ===

export const textInputFocused = when(
  "textInputFocused",
  (ctx) => ctx.textInputFocused,
)

export const inMoveMode = when("inMoveMode", (ctx) => ctx.mode === "move")

export const isInDetailPane = when(
  "isInDetailPane",
  (ctx) => ctx.isInDetailPane,
)

export const isInOutlineMode = when(
  "isInOutlineMode",
  (ctx) => ctx.isInOutlineMode,
)

export const hasSelection = when("hasSelection", (ctx) => ctx.hasSelection)
