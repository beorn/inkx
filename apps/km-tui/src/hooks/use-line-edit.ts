/**
 * useLineEdit Hook
 *
 * Provides readline-style line editing for text input.
 * Supports cursor movement, word deletion, and common editing shortcuts.
 */
import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react"
import { useInput, type Key } from "inkx"

export interface LineEditState {
  /** Current text value */
  value: string
  /** Cursor position (0 = before first char, value.length = after last char) */
  cursor: number
}

export interface UseLineEditOptions {
  /** Initial value */
  initialValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Whether input is active */
  isActive?: boolean
  /** Handle Enter key (default: false - let parent handle) */
  handleEnter?: boolean
  /** Handle Escape key (default: false - let parent handle) */
  handleEscape?: boolean
  /** Handle Up/Down arrows (default: false - let parent handle for list navigation) */
  handleVerticalArrows?: boolean
}

export interface UseLineEditResult {
  /** Current text value */
  value: string
  /** Cursor position */
  cursor: number
  /** Text before cursor (for rendering) */
  beforeCursor: string
  /** Text after cursor (for rendering) */
  afterCursor: string
  /** Clear the input */
  clear: () => void
  /** Set value programmatically */
  setValue: (value: string) => void
}

/**
 * Handle key input for line editing.
 * Extracted to reduce complexity in the main hook.
 */
// oxlint-disable-next-line complexity/max-cognitive -- Key handlers are inherently branchy; sequential if/return is the clearest pattern for input dispatch
function handleKeyInput(
  input: string,
  key: Key,
  state: LineEditState,
  setState: Dispatch<SetStateAction<LineEditState>>,
  updateValue: (newValue: string, newCursor: number) => void,
): void {
  const { value, cursor } = state

  // Ctrl+A: Move to beginning
  if (key.ctrl && input === "a") {
    setState((s) => ({ ...s, cursor: 0 }))
    return
  }

  // Ctrl+E: Move to end
  if (key.ctrl && input === "e") {
    setState((s) => ({ ...s, cursor: s.value.length }))
    return
  }

  // Ctrl+W: Delete word backwards
  if (key.ctrl && input === "w") {
    if (cursor === 0) return
    let newCursor = cursor
    while (newCursor > 0 && value[newCursor - 1] === " ") newCursor--
    while (newCursor > 0 && value[newCursor - 1] !== " ") newCursor--
    const newValue = value.slice(0, newCursor) + value.slice(cursor)
    updateValue(newValue, newCursor)
    return
  }

  // Ctrl+U: Delete to beginning
  if (key.ctrl && input === "u") {
    updateValue(value.slice(cursor), 0)
    return
  }

  // Ctrl+K: Delete to end
  if (key.ctrl && input === "k") {
    updateValue(value.slice(0, cursor), cursor)
    return
  }

  // Ctrl+B or Left: Move cursor left
  if ((key.ctrl && input === "b") || key.leftArrow) {
    if (cursor > 0) setState((s) => ({ ...s, cursor: s.cursor - 1 }))
    return
  }

  // Ctrl+F or Right: Move cursor right
  if ((key.ctrl && input === "f") || key.rightArrow) {
    if (cursor < value.length) setState((s) => ({ ...s, cursor: s.cursor + 1 }))
    return
  }

  // Backspace: Delete char before cursor
  if (key.backspace || key.delete) {
    if (cursor > 0) {
      updateValue(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1)
    }
    return
  }

  // Regular character input
  if (input.length === 1 && input >= " " && input !== "\x7f") {
    updateValue(
      value.slice(0, cursor) + input + value.slice(cursor),
      cursor + 1,
    )
  }
}

/**
 * Hook for readline-style line editing.
 *
 * Supported shortcuts:
 * - Ctrl+A: Move to beginning
 * - Ctrl+E: Move to end
 * - Ctrl+W: Delete word backwards
 * - Ctrl+U: Delete to beginning
 * - Ctrl+K: Delete to end
 * - Ctrl+B / Left: Move cursor left
 * - Ctrl+F / Right: Move cursor right
 * - Backspace: Delete char before cursor
 *
 * By default, does NOT handle Enter, Escape, or Up/Down arrows
 * to allow parent components to use those for other purposes.
 */
export function useLineEdit({
  initialValue = "",
  onChange,
  isActive = true,
  handleEnter = false,
  handleEscape = false,
  handleVerticalArrows = false,
}: UseLineEditOptions = {}): UseLineEditResult {
  const [state, setState] = useState<LineEditState>({
    value: initialValue,
    cursor: initialValue.length,
  })

  const updateValue = useCallback(
    (newValue: string, newCursor: number) => {
      setState({ value: newValue, cursor: newCursor })
      onChange?.(newValue)
    },
    [onChange],
  )

  const clear = useCallback(() => {
    setState({ value: "", cursor: 0 })
    onChange?.("")
  }, [onChange])

  const setValue = useCallback(
    (value: string) => {
      setState({ value, cursor: value.length })
      onChange?.(value)
    },
    [onChange],
  )

  useInput(
    (input, key) => {
      // Let parent handle Enter/Escape/vertical arrows unless explicitly enabled
      if (key.return && !handleEnter) return
      if (key.escape && !handleEscape) return
      if ((key.upArrow || key.downArrow) && !handleVerticalArrows) return

      // Dispatch to handler
      handleKeyInput(input, key, state, setState, updateValue)
    },
    { isActive },
  )

  return {
    value: state.value,
    cursor: state.cursor,
    beforeCursor: state.value.slice(0, state.cursor),
    afterCursor: state.value.slice(state.cursor),
    clear,
    setValue,
  }
}
