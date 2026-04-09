/**
 * Dialog Guard — Focus Scope Integration
 *
 * Manages dialog lifecycle via the FocusManager's scope stack. When a dialog
 * opens, the corresponding mode is pushed as a scope; when it closes, the scope
 * is popped. The mode stack is now derived from the FocusManager's scope stack
 * rather than maintaining a parallel state.
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
import type { FocusManager } from "@silvery/ag-react"

// The FocusManager instance that owns the canonical scope stack.
// When set, push/pop/current delegate to it. When null, falls back
// to the local ModeStack (for tests that don't wire up a FocusManager).
let focusManagerRef: FocusManager | null = null

// Fallback mode stack for environments without a FocusManager (e.g., some tests)
const fallbackStack: ModeStack = createModeStack()

// Grace period timestamp for Enter key propagation suppression.
// 500ms is generous enough to survive CI load where performance.now()
// can advance significantly between synchronous board.press() calls.
let dialogConfirmedAt = 0
const DIALOG_CONFIRM_GRACE_MS = 500

/**
 * Bind the dialog guard to a FocusManager instance.
 * After binding, push/pop/current delegate to the FocusManager's scope stack.
 */
export function bindFocusManager(fm: FocusManager): void {
  focusManagerRef = fm
}

/** Get the shared mode stack instance (derived from FocusManager when bound). */
export function getModeStack(): ModeStack {
  if (!focusManagerRef) return fallbackStack

  const fm = focusManagerRef
  // Return a ModeStack-shaped object that reads from the FocusManager
  return {
    push(mode: InputMode) {
      fm.enterScope(mode)
    },
    pop() {
      const stack = fm.scopeStack
      const top = stack[stack.length - 1] as InputMode | undefined
      if (top !== undefined) fm.exitScope()
      return top
    },
    current(): InputMode {
      const stack = fm.scopeStack
      return (stack[stack.length - 1] as InputMode) ?? "command"
    },
    includes(mode: InputMode) {
      return fm.scopeStack.includes(mode)
    },
    size() {
      return fm.scopeStack.length
    },
    isDialog() {
      return this.current().startsWith("dialog:")
    },
    clear() {
      // Pop all scopes to reset
      while (fm.scopeStack.length > 0) {
        fm.exitScope()
      }
    },
  }
}

/** Reset the mode stack to command mode. Used by test helpers between test runs. */
export function resetModeStack(): void {
  if (focusManagerRef) {
    // Clear all scopes from the FocusManager
    while (focusManagerRef.scopeStack.length > 0) {
      focusManagerRef.exitScope()
    }
  }
  fallbackStack.clear()
  focusManagerRef = null
  dialogConfirmedAt = 0
}

/** Push a dialog mode onto the stack (called when a dialog opens). */
export function pushDialogMode(mode: InputMode): void {
  getModeStack().push(mode)
}

/** Pop the current dialog mode off the stack (called when a dialog closes). */
export function popDialogMode(): InputMode | undefined {
  return getModeStack().pop()
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
