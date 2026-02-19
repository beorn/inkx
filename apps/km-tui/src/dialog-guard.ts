/**
 * Dialog Guard — Mode Stack Integration
 *
 * Manages dialog lifecycle via the input mode stack. When a dialog opens,
 * the corresponding mode is pushed; when it closes, the mode is popped.
 *
 * Also provides a brief grace period after dialog confirm to prevent the
 * Enter key from propagating to the newly-focused card (P1 fix: km-tui.keys-as-text).
 *
 * Used by:
 * - board-actions.ts: calls pushDialogMode() on dialog open, popDialogMode() on close
 * - board-actions.ts: calls markDialogConfirmed() in DIALOG_CONFIRM handler
 * - board-actions.ts: checks isDialogConfirmGracePeriod() in ENTER_INLINE_EDIT handler
 * - board-app.ts: checks modeStack.isDialog() to filter non-dialog commands
 */

import { createModeStack, type InputMode, type ModeStack } from "./input-mode.ts"

// Module-level singleton mode stack
const modeStack: ModeStack = createModeStack()

// Grace period timestamp for Enter key propagation suppression
let dialogConfirmedAt = 0
const DIALOG_CONFIRM_GRACE_MS = 100

/** Get the shared mode stack instance. */
export function getModeStack(): ModeStack {
  return modeStack
}

/** Reset the mode stack to command mode. Used by test helpers between test runs. */
export function resetModeStack(): void {
  modeStack.clear()
}

/** Push a dialog mode onto the stack (called when a dialog opens). */
export function pushDialogMode(mode: InputMode): void {
  modeStack.push(mode)
}

/** Pop the current dialog mode off the stack (called when a dialog closes). */
export function popDialogMode(): InputMode | undefined {
  return modeStack.pop()
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
