/**
 * BlockEditTarget Interface
 *
 * Active block editor registers action methods via this interface.
 * The command system dispatches text/block editing actions to the current target.
 * Set by useLineEdit on mount, cleared on unmount.
 *
 * This is the Slate-ready abstraction boundary: useLineEdit implements it now,
 * Slate would implement it later. Block navigation, UIState, keybindings, and
 * action handlers don't change when the editing engine swaps.
 */

export interface BlockEditTarget {
  // Text operations (useLineEdit implements these now, Slate later)
  insertChar(char: string): void
  deleteBackward(): void
  deleteForward(): void
  cursorLeft(): void
  cursorRight(): void
  cursorStart(): void
  cursorEnd(): void
  deleteWord(): void
  deleteToStart(): void
  deleteToEnd(): void
  confirm(): void
  cancel(): void

  // Slate-ready operations
  /** Persist current content without exiting edit mode */
  save(): void
  /** Character offset for split/merge operations */
  getCursorOffset(): number
  /** Current edited content string */
  getContent(): string
}

/**
 * Shared mutable ref for the active block edit target.
 * Only one editor is active at a time (inline edit or search).
 * Set by useLineEdit on mount, cleared on unmount.
 */
export const blockEditTargetRef: { current: BlockEditTarget | null } = {
  current: null,
}

// Backward compat aliases
export type TextEditTarget = BlockEditTarget
export const textEditTargetRef = blockEditTargetRef
