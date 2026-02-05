/**
 * InlineEditField — inline text editor for node titles.
 *
 * Uses useLineEdit for readline-style text editing.
 * A separate useInputLayer handles Return (confirm) and Escape (cancel).
 */

import React, { useCallback, useId, useRef } from "react"
import { Text, useInputLayer, type Key } from "inkx"
import { useLineEdit } from "../hooks/use-line-edit.ts"

interface InlineEditFieldProps {
  initialValue: string
  onConfirm: (newValue: string) => void
  onCancel: () => void
}

export function InlineEditField({
  initialValue,
  onConfirm,
  onCancel,
}: InlineEditFieldProps): React.ReactElement {
  const layerId = useId()
  const { value, beforeCursor, afterCursor } = useLineEdit({
    initialValue,
    isActive: true,
  })

  // Use ref to avoid stale value in the confirm handler.
  // Without this, batched React updates (e.g., rapid key presses in tests)
  // cause onConfirm to receive an outdated value.
  const valueRef = useRef(value)
  valueRef.current = value

  // Separate layer for Return/Escape — sits above line-edit layer
  useInputLayer(
    `inline-edit-control-${layerId}`,
    useCallback(
      (_input: string, key: Key): boolean => {
        if (key.return) {
          onConfirm(valueRef.current)
          return true
        }
        if (key.escape) {
          onCancel()
          return true
        }
        return false
      },
      [onConfirm, onCancel],
    ),
  )

  // Cursor character: show inverse block at cursor position
  const cursorChar = afterCursor.length > 0 ? afterCursor[0] : " "
  const restAfterCursor = afterCursor.length > 1 ? afterCursor.slice(1) : ""

  return (
    <Text>
      {beforeCursor}
      <Text inverse>{cursorChar}</Text>
      {restAfterCursor}
    </Text>
  )
}
