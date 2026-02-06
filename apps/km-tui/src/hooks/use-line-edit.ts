/**
 * useLineEdit Hook
 *
 * Provides readline-style line editing for text input.
 * Registers a TextEditTarget on mount so the command system can
 * dispatch text editing actions to this component.
 */
import { useState, useCallback, useLayoutEffect, useMemo, useRef } from "react"
import type { BlockEditTarget } from "../block-edit-target.ts"
import { blockEditTargetRef } from "../block-edit-target.ts"

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
  /** Called when Enter is pressed (text.confirm command) */
  onConfirm?: (value: string) => void
  /** Called when Escape is pressed (text.cancel command) */
  onCancel?: () => void
  /** Called when save() is invoked (auto-save on block navigate) */
  onSave?: (value: string) => void
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
 * Hook for readline-style line editing.
 *
 * Instead of handling keys directly via useInputLayer,
 * this hook registers a TextEditTarget. The command system
 * dispatches text editing actions to the target when
 * textInputFocused is true.
 *
 * Supported operations (via command system):
 * - text.cursor_start (Ctrl+A): Move to beginning
 * - text.cursor_end (Ctrl+E): Move to end
 * - text.delete_word (Ctrl+W): Delete word backwards
 * - text.delete_to_start (Ctrl+U): Delete to beginning
 * - text.delete_to_end (Ctrl+K): Delete to end
 * - text.cursor_left (Ctrl+B / Left): Move cursor left
 * - text.cursor_right (Ctrl+F / Right): Move cursor right
 * - text.delete_backward (Backspace): Delete char before cursor
 * - text.delete_forward (Delete): Delete char after cursor
 * - text.insert (printable chars): Insert character at cursor
 * - text.confirm (Enter): Confirm edit
 * - text.cancel (Escape): Cancel edit
 */
export function useLineEdit({
  initialValue = "",
  onChange,
  onConfirm,
  onCancel,
  onSave,
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

  // Use refs to avoid stale closures in the TextEditTarget methods
  const stateRef = useRef(state)
  stateRef.current = state
  const updateValueRef = useRef(updateValue)
  updateValueRef.current = updateValue
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // Track whether cancel() was explicitly called (Escape).
  // If not cancelled and value changed, auto-save on unmount (navigate-away saves).
  const cancelledRef = useRef(false)
  const initialValueRef = useRef(initialValue)

  // Build BlockEditTarget (stable reference via useMemo with no deps)
  const target: BlockEditTarget = useMemo(
    () => ({
      insertChar(char: string) {
        const { value, cursor } = stateRef.current
        updateValueRef.current(
          value.slice(0, cursor) + char + value.slice(cursor),
          cursor + 1,
        )
      },
      deleteBackward() {
        const { value, cursor } = stateRef.current
        if (cursor > 0) {
          updateValueRef.current(
            value.slice(0, cursor - 1) + value.slice(cursor),
            cursor - 1,
          )
        }
      },
      deleteForward() {
        const { value, cursor } = stateRef.current
        if (cursor < value.length) {
          updateValueRef.current(
            value.slice(0, cursor) + value.slice(cursor + 1),
            cursor,
          )
        }
      },
      cursorLeft() {
        setState((s) => (s.cursor > 0 ? { ...s, cursor: s.cursor - 1 } : s))
      },
      cursorRight() {
        setState((s) =>
          s.cursor < s.value.length ? { ...s, cursor: s.cursor + 1 } : s,
        )
      },
      cursorStart() {
        setState((s) => ({ ...s, cursor: 0 }))
      },
      cursorEnd() {
        setState((s) => ({ ...s, cursor: s.value.length }))
      },
      deleteWord() {
        const { value, cursor } = stateRef.current
        if (cursor === 0) return
        let newCursor = cursor
        while (newCursor > 0 && value[newCursor - 1] === " ") newCursor--
        while (newCursor > 0 && value[newCursor - 1] !== " ") newCursor--
        updateValueRef.current(
          value.slice(0, newCursor) + value.slice(cursor),
          newCursor,
        )
      },
      deleteToStart() {
        const { value, cursor } = stateRef.current
        updateValueRef.current(value.slice(cursor), 0)
      },
      deleteToEnd() {
        const { value, cursor } = stateRef.current
        updateValueRef.current(value.slice(0, cursor), cursor)
      },
      confirm() {
        cancelledRef.current = true // Prevent auto-save on unmount
        onConfirmRef.current?.(stateRef.current.value)
      },
      cancel() {
        cancelledRef.current = true // Prevent auto-save on unmount
        onCancelRef.current?.()
      },
      save() {
        const fn = onSaveRef.current ?? onConfirmRef.current
        fn?.(stateRef.current.value)
        // Update initialValue so auto-save on unmount doesn't re-save
        initialValueRef.current = stateRef.current.value
      },
      getCursorOffset() {
        return stateRef.current.cursor
      },
      getContent() {
        return stateRef.current.value
      },
    }),
    [],
  )

  // Register as active text edit target on mount, clear on unmount.
  // useLayoutEffect ensures registration happens before the next input event.
  // On unmount: if not explicitly cancelled/confirmed and value changed, auto-save.
  // This implements "navigate away saves" — moving cursor away from an edited node
  // unmounts the InlineEditField, triggering a save of the edited content.
  useLayoutEffect(() => {
    blockEditTargetRef.current = target
    return () => {
      if (blockEditTargetRef.current === target) {
        blockEditTargetRef.current = null
      }
      // Auto-save on unmount if value was modified and not explicitly cancelled/confirmed
      if (!cancelledRef.current) {
        const currentValue = stateRef.current.value
        if (currentValue !== initialValueRef.current) {
          onConfirmRef.current?.(currentValue)
        }
      }
    }
  }, [target])

  return {
    value: state.value,
    cursor: state.cursor,
    beforeCursor: state.value.slice(0, state.cursor),
    afterCursor: state.value.slice(state.cursor),
    clear,
    setValue,
  }
}
