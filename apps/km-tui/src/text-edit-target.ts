/**
 * TextEditTarget Interface
 *
 * Active text editor registers action methods via this interface.
 * The command system dispatches text editing actions to the current target.
 * Set by useLineEdit on mount, cleared on unmount.
 */

export interface TextEditTarget {
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
}

/**
 * Shared mutable ref for the active text edit target.
 * Only one text editor is active at a time (inline edit or search).
 * Set by useLineEdit on mount, cleared on unmount.
 */
export const textEditTargetRef: { current: TextEditTarget | null } = {
  current: null,
}
