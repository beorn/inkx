/**
 * InlineEditField — inline text editor for node titles.
 *
 * Uses useLineEdit which registers a TextEditTarget.
 * All key handling is done by the command system via when: textInputFocused.
 * No component-level useInputLayer needed.
 */

import React from "react"
import { Text } from "inkx"
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
  const { beforeCursor, afterCursor } = useLineEdit({
    initialValue,
    onConfirm,
    onCancel,
  })

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
