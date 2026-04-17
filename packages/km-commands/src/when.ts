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

/** True when there's a cursor node — used to gate cursor-required commands.
 *  When cursor is null (user deselected via empty-space click), cursor-
 *  targeted keybindings should be no-ops at the binding layer rather than
 *  dispatching ops that fail with "cursor is null" errors. Commands that
 *  operate on the board as a whole (fold_all_more, filter, toggle_view_mode,
 *  etc) do NOT need this guard. */
export const hasCursor = when("hasCursor", (ctx) => ctx.currentNode != null)

export const textInputFocused = when("textInputFocused", (ctx) => ctx.textInputFocused)

export const inMoveMode = when("inMoveMode", (ctx) => ctx.mode === "move")

export const isInDetailPane = when("isInDetailPane", (ctx) => ctx.isInDetailPane)

export const isInOutlineMode = when("isInOutlineMode", (ctx) => ctx.isInOutlineMode)

export const hasMultiSelection = when("hasMultiSelection", (ctx) => ctx.hasMultiSelection)

export const isInlineEditing = when("isInlineEditing", (ctx) => ctx.isInlineEditing)

export const searchDialogOpen = when("searchDialogOpen", (ctx) => ctx.searchDialogOpen)

export const itemPickerOpen = when("itemPickerOpen", (ctx) => ctx.itemPickerOpen)

export const newItemDialogOpen = when("newItemDialogOpen", (ctx) => ctx.newItemDialogOpen)

/** Any text-input dialog is open (search, item picker, new item, date prompt, omnibox, search/replace) */
export const anyDialogOpen = when(
  "anyDialogOpen",
  (ctx) =>
    ctx.searchDialogOpen ||
    ctx.itemPickerOpen ||
    ctx.newItemDialogOpen ||
    ctx.datePromptOpen ||
    !!ctx.omniboxOpen ||
    !!ctx.searchReplaceOpen,
)

/** Filter dialog is open (separate from text-input dialogs — has its own key handling) */
export const filterDialogOpen = when("filterDialogOpen", (ctx) => ctx.filterDialogOpen)

/** Omnibox / command palette is open */
export const omniboxOpen = when("omniboxOpen", (ctx) => !!ctx.omniboxOpen)

/** Any dialog OR filter panel is open */
export const anyOverlayOpen = when(
  "anyOverlayOpen",
  (ctx) =>
    ctx.searchDialogOpen ||
    ctx.itemPickerOpen ||
    ctx.newItemDialogOpen ||
    ctx.datePromptOpen ||
    ctx.filterDialogOpen ||
    !!ctx.omniboxOpen ||
    !!ctx.searchReplaceOpen,
)

export const helpOverlayOpen = when("helpOverlayOpen", (ctx) => ctx.helpOverlayOpen)

export const deleteConfirmOpen = when("deleteConfirmOpen", (ctx) => ctx.deleteConfirmOpen)

export const consoleOpen = when("consoleOpen", (ctx) => ctx.consoleOpen)

export const hasActiveToast = when("hasActiveToast", (ctx) => ctx.hasActiveToast)

export const inVisualMode = when("inVisualMode", (ctx) => !!ctx.visualMode)

export const localFindActive = when("localFindActive", (ctx) => !!ctx.localFindActive)

export const searchReplaceOpen = when("searchReplaceOpen", (ctx) => !!ctx.searchReplaceOpen)

/** True when the terminal supports Kitty keyboard protocol (Cmd key available) */
export const hasKitty = when("hasKitty", (ctx) => !!ctx.hasKitty)

/** True when the active input is a single-line field (Tab = focus next) */
export const inputTypeField = when("inputTypeField", (ctx) => ctx.inputType === "field")

/** True when the active input is a multi-line textarea (Tab = indent) */
export const inputTypeTextarea = when("inputTypeTextarea", (ctx) => ctx.inputType === "textarea")

// === Focus scope predicates ===
// These check the activeScopes field populated from the FocusManager's scope stack.

/** True when the given scope ID is in the active focus scope stack. */
export function inScope(scopeId: string): WhenPredicate {
  return when(`inScope:${scopeId}`, (ctx) => ctx.activeScopes?.includes(scopeId) ?? false)
}

// === Mode predicates ===
// These check the inputMode field, which is derived from the FocusManager's
// scope stack (top-of-stack, defaulting to "command" when empty).

/** True when in command mode (no dialog, no insert — the default). */
export const inCommandMode = when("inCommandMode", (ctx) => (ctx.inputMode ?? "command") === "command")

/** True when in insert/text editing mode. */
export const inInsertMode = when("inInsertMode", (ctx) => ctx.inputMode === "insert")

/** True when any dialog:* mode is active. */
export const inDialog = when("inDialog", (ctx) => (ctx.inputMode ?? "command").startsWith("dialog:"))

// Per-dialog mode predicates (inDialogSearch, inDialogFilter, etc.) were
// deleted in the inscope-commands + modestack-eliminate refactor. Use
// inScope("dialog:search"), inScope("dialog:filter"), etc. instead.
