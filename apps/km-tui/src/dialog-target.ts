/**
 * Dialog Target Ref
 *
 * Shared ref that active dialogs register with to receive
 * navigation/confirm/cancel actions from the command system.
 *
 * Similar to activeEditTargetRef for text editing, but for dialog operations.
 * Only one dialog can be active at a time.
 */

export interface DialogTarget {
  navUp(): void
  navDown(): void
  confirm(): void
  cancel(): void
}

/**
 * Global ref to the currently active dialog target.
 * Set by dialog components on mount, cleared on unmount.
 */
export const dialogTargetRef: { current: DialogTarget | null } = {
  current: null,
}
