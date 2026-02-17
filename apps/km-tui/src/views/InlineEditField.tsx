/**
 * InlineEditField — inline text editor for node titles and body blocks.
 *
 * Uses useSlateEdit which registers a BlockEditTarget.
 * All key handling is done by the command system via when: textInputFocused.
 * No component-level useInputLayer needed.
 *
 * Width is auto-detected via useContentRect() — the nearest Box ancestor's
 * content width is used for visual line wrapping. This guarantees cursor
 * positions match inkx's rendered line breaks.
 */

import React from "react"
import { Text, useContentRect } from "inkx"
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
  /** Initial cursor position when entering edit mode via block navigation */
  initialCursorPos?: "start" | "end"
}

export function InlineEditField({
  initialValue,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  initialCursorPos,
}: InlineEditFieldProps): React.ReactElement {
  // Auto-detect width from nearest Box ancestor's content area.
  // This is the same width inkx's renderer uses for word wrapping,
  // ensuring cursor positions match displayed line breaks.
  const { width } = useContentRect()

  const { beforeCursor, afterCursor } = useSlateEdit({
    initialValue,
    onConfirm,
    onCancel,
    onSave,
    onSplitAtBoundary,
    onMergeBackward,
    lineWidth: width > 0 ? width : undefined,
    initialCursorPos,
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
