/**
 * Input Mode Stack
 *
 * Manages the active input mode for the TUI. Replaces fragile boolean checks
 * and timestamp-based grace periods with a clean push/pop stack.
 *
 * The bottom of the stack is implicitly "command" mode (empty stack = command).
 * Dialog open -> push; dialog close -> pop. Nested dialogs stack naturally.
 *
 * Used by:
 * - board-app.ts: checks modeStack.isDialog() to filter non-dialog commands
 * - dialog-guard.ts: push/pop on dialog open/close
 * - when.ts: mode predicates for keybinding conditions
 */

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

/** Create a mode stack with push/pop/current semantics. Factory function, no classes. */
export function createModeStack() {
  const stack: InputMode[] = []

  return {
    /** Push a new mode onto the stack. */
    push(mode: InputMode) {
      stack.push(mode)
    },

    /** Pop the top mode off the stack. Returns the removed mode, or undefined if empty. */
    pop() {
      return stack.pop()
    },

    /** Current active mode. Returns "command" when the stack is empty. */
    current(): InputMode {
      return stack[stack.length - 1] ?? "command"
    },

    /** Check if a specific mode is anywhere in the stack. */
    includes(mode: InputMode) {
      return stack.includes(mode)
    },

    /** Number of modes on the stack. */
    size() {
      return stack.length
    },

    /** True if the current mode is any dialog:* mode. */
    isDialog() {
      return this.current().startsWith("dialog:")
    },

    /** Clear the entire stack, resetting to command mode. */
    clear() {
      stack.length = 0
    },
  }
}

export type ModeStack = ReturnType<typeof createModeStack>
