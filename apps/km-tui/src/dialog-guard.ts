/**
 * Dialog Confirm Guard
 *
 * P1 fix (km-tui.keys-as-text): Prevents Enter key propagation after dialog close.
 *
 * When a dialog closes via DIALOG_CONFIRM, the Enter key that confirmed the dialog
 * can propagate to the newly-focused card in the same event batch or via rapid
 * double-tap, triggering inline edit mode. This module provides a timestamp-based
 * guard that suppresses ENTER_INLINE_EDIT within a brief grace period after any
 * dialog confirm.
 *
 * Used by:
 * - board-actions.ts: calls markDialogConfirmed() in DIALOG_CONFIRM handler
 * - board-actions.ts: checks isDialogConfirmGracePeriod() in ENTER_INLINE_EDIT handler
 */

let dialogConfirmedAt = 0
const DIALOG_CONFIRM_GRACE_MS = 100

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
