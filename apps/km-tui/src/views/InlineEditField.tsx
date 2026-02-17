/**
 * InlineEditField — inline text editor for node titles and body blocks.
 *
 * Uses useSlateEdit which registers a BlockEditTarget.
 * All key handling is done by the command system via when: textInputFocused.
 * No component-level useInputLayer needed.
 */

import React from "react"
import { Text } from "inkx"
import { useSlateEdit } from "../editor/index.ts"

interface InlineEditFieldProps {
  initialValue: string
  onConfirm: (newValue: string) => void
  onCancel: () => void
  /** Called when save() is invoked (auto-save on block navigate) */
  onSave?: (newValue: string) => void
  /** Called when Enter creates a new tree node (split at boundary) */
  onSplitAtBoundary?: (offset: number) => void
  /** Called when Backspace at start needs a tree merge */
  onMergeBackward?: () => void
  /** Available width for visual line wrapping (for cursor up/down) */
  lineWidth?: number
}

export function InlineEditField({
  initialValue,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  lineWidth,
}: InlineEditFieldProps): React.ReactElement {
  const { beforeCursor, afterCursor } = useSlateEdit({
    initialValue,
    onConfirm,
    onCancel,
    onSave,
    onSplitAtBoundary,
    onMergeBackward,
    lineWidth,
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
