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
export function when(label: string, fn: (ctx: KeybindingContext) => boolean): WhenPredicate {
  return Object.assign(fn, { label })
}

/** Negate a predicate */
export function not(pred: WhenPredicate): WhenPredicate {
  return when(`!${pred.label}`, (ctx) => !pred(ctx))
}

/** Combine predicates with AND */
export function and(...preds: WhenPredicate[]): WhenPredicate {
  return when(preds.map((p) => p.label).join(" && "), (ctx) => preds.every((p) => p(ctx)))
}

// === Pre-built predicates ===

export const textInputFocused = when("textInputFocused", (ctx) => ctx.textInputFocused)

export const inMoveMode = when("inMoveMode", (ctx) => ctx.mode === "move")

export const isInDetailPane = when("isInDetailPane", (ctx) => ctx.isInDetailPane)

export const isInOutlineMode = when("isInOutlineMode", (ctx) => ctx.isInOutlineMode)

export const hasMultiSelection = when("hasMultiSelection", (ctx) => ctx.hasMultiSelection)

export const isInlineEditing = when("isInlineEditing", (ctx) => ctx.isInlineEditing)

export const searchDialogOpen = when("searchDialogOpen", (ctx) => ctx.searchDialogOpen)

export const projectPickerOpen = when("projectPickerOpen", (ctx) => ctx.projectPickerOpen)

export const newItemDialogOpen = when("newItemDialogOpen", (ctx) => ctx.newItemDialogOpen)

/** Any text-input dialog is open (search, project picker, new item, date prompt) */
export const anyDialogOpen = when(
  "anyDialogOpen",
  (ctx) => ctx.searchDialogOpen || ctx.projectPickerOpen || ctx.newItemDialogOpen || ctx.datePromptOpen,
)

/** Filter dialog is open (separate from text-input dialogs — has its own key handling) */
export const filterDialogOpen = when("filterDialogOpen", (ctx) => ctx.filterDialogOpen)

/** Any dialog OR filter panel is open */
export const anyOverlayOpen = when(
  "anyOverlayOpen",
  (ctx) =>
    ctx.searchDialogOpen ||
    ctx.projectPickerOpen ||
    ctx.newItemDialogOpen ||
    ctx.datePromptOpen ||
    ctx.filterDialogOpen,
)

export const helpOverlayOpen = when("helpOverlayOpen", (ctx) => ctx.helpOverlayOpen)

export const deleteConfirmOpen = when("deleteConfirmOpen", (ctx) => ctx.deleteConfirmOpen)

export const consoleOpen = when("consoleOpen", (ctx) => ctx.consoleOpen)

export const hasActiveToast = when("hasActiveToast", (ctx) => ctx.hasActiveToast)
