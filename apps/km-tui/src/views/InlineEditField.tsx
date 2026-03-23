/**
 * InlineEditField — inline text editor for node titles and body blocks.
 *
 * Uses useEditContext (silvery EditContext) which registers an EditTarget.
 * All key handling is done by the command system via when: textInputFocused.
 * No component-level useInputLayer needed.
 *
 * Width is auto-detected via useContentRect() — the nearest Box ancestor's
 * content width is used for visual line wrapping. This guarantees cursor
 * positions match silvery's rendered line breaks.
 */

import React from "react"
import { CursorLine, useContentRect, useEditContext } from "@silvery/ag-react"

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
  initialCursorPos?: "start" | "end" | number
  /** Preferred cursor column preserved across block boundaries */
  stickyX?: number
}

export function InlineEditField({
  initialValue,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  initialCursorPos,
  stickyX,
}: InlineEditFieldProps): React.ReactElement {
  // Auto-detect width from nearest Box ancestor's content area.
  // This is the same width silvery's renderer uses for word wrapping,
  // ensuring cursor positions match displayed line breaks.
  const { width } = useContentRect()

  const { beforeCursor, afterCursor } = useEditContext({
    initialValue,
    onConfirm,
    onCancel,
    onSave,
    onSplitAtBoundary,
    onMergeBackward,
    wrapWidth: width > 0 ? width : undefined,
    initialCursorPos,
    stickyX,
  })

  return <CursorLine beforeCursor={beforeCursor} afterCursor={afterCursor} />
}
