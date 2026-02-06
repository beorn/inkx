/**
 * InlineEditField — inline text editor for node titles and body blocks.
 *
 * Uses useLineEdit which registers a BlockEditTarget.
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
  /** Called when save() is invoked (auto-save on block navigate) */
  onSave?: (newValue: string) => void
}

export function InlineEditField({
  initialValue,
  onConfirm,
  onCancel,
  onSave,
}: InlineEditFieldProps): React.ReactElement {
  const { beforeCursor, afterCursor } = useLineEdit({
    initialValue,
    onConfirm,
    onCancel,
    onSave,
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
