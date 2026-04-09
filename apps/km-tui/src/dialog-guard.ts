/**
 * Dialog Guard — FocusManager-backed dialog mode tracking
 *
 * Dialog modes are tracked directly by the FocusManager's scope stack. When a
 * dialog opens, the mode is pushed as a focus scope; when it closes, the scope
 * is popped. There is no parallel stack — FocusManager.scopeStack is the
 * canonical source of truth, consumed by inScope() predicates and by the
 * `inputMode` KeybindingContext field.
 *
 * This module exposes thin helpers that delegate to the module-level
 * FocusManager reference installed via `installDialogGuard()`. The helpers
 * exist so dialog-opening/closing call sites (board-actions*, WorkspaceChrome)
 * don't need to thread a FocusManager through every layer.
 *
 * Also provides a brief grace period after dialog confirm to prevent the
 * Enter key from propagating to the newly-focused card
 * (P1 fix: km-tui.keys-as-text).
 *
 * Used by:
 * - board-actions.ts / board-actions-find.ts / board-actions-search-replace.ts:
 *   calls pushDialogMode() on dialog open, popDialogMode() on close,
 *   markDialogConfirmed() in DIALOG_CONFIRM handler, isDialogConfirmGracePeriod()
 *   in ENTER_INLINE_EDIT handler.
 * - board-app.ts: checks isDialogOpen() to filter non-dialog commands.
 * - driver.ts: calls installDialogGuard(focusManager) during setup.
 */

import type { FocusManager } from "@silvery/ag-react"

/** All input mode string literals — union type used as scope IDs. */
export type InputMode =
  | "command"
  | "insert"
  | "dialog:search"
  | "dialog:rename"
  | "dialog:confirm"
  | "dialog:newItem"
  | "dialog:picker"
  | "dialog:datePrompt"
  | "dialog:filter"
  | "dialog:omnibox"
  | "dialog:favorites"
  | "dialog:localFind"
  | "dialog:searchReplace"

// The FocusManager instance that owns the canonical scope stack. Installed by
// driver.ts / test helpers before any push/pop calls.
let activeFocusManager: FocusManager | null = null

// Grace period timestamp for Enter key propagation suppression.
// 500ms is generous enough to survive CI load where performance.now() can
// advance significantly between synchronous board.press() calls.
let dialogConfirmedAt = 0
const DIALOG_CONFIRM_GRACE_MS = 500

/**
 * Install a FocusManager instance as the dialog guard backend.
 * After installation, push/pop/current read and mutate its scope stack.
 */
export function installDialogGuard(fm: FocusManager): void {
  activeFocusManager = fm
}

/** The current active input mode — top of the FocusManager scope stack, or "command" when empty. */
export function currentMode(): InputMode {
  if (!activeFocusManager) return "command"
  const stack = activeFocusManager.scopeStack
  return (stack[stack.length - 1] as InputMode | undefined) ?? "command"
}

/** True if the current mode is any `dialog:*` mode. */
export function isDialogOpen(): boolean {
  return currentMode().startsWith("dialog:")
}

/** Push a dialog mode (called when a dialog opens). */
export function pushDialogMode(mode: InputMode): void {
  if (!activeFocusManager) return
  activeFocusManager.enterScope(mode)
}

/** Pop the current dialog mode (called when a dialog closes). Returns the removed mode. */
export function popDialogMode(): InputMode | undefined {
  if (!activeFocusManager) return undefined
  const stack = activeFocusManager.scopeStack
  const top = stack[stack.length - 1] as InputMode | undefined
  if (top === undefined) return undefined
  activeFocusManager.exitScope()
  return top
}

/**
 * Reset dialog guard state — clears the FocusManager scope stack and grace
 * period. Used by test helpers between test runs and by driver setup.
 */
export function resetDialogGuard(): void {
  if (activeFocusManager) {
    while (activeFocusManager.scopeStack.length > 0) {
      activeFocusManager.exitScope()
    }
  }
  activeFocusManager = null
  dialogConfirmedAt = 0
}

/** Mark that a dialog was just confirmed (called from DIALOG_CONFIRM handler). */
export function markDialogConfirmed(): void {
  dialogConfirmedAt = performance.now()
}

/** Check if a dialog was recently confirmed (suppresses ENTER_INLINE_EDIT). */
export function isDialogConfirmGracePeriod(): boolean {
  if (dialogConfirmedAt === 0) return false
  const elapsed = performance.now() - dialogConfirmedAt
  return elapsed < DIALOG_CONFIRM_GRACE_MS
}
