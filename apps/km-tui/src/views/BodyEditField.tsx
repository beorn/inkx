/**
 * BodyEditField — multi-line body block editor using EditContextDisplay.
 *
 * Uses useEditContext for text state + command system integration, and
 * EditContextDisplay for rendering with scroll viewport. For body blocks
 * that may have long content (code blocks, long paragraphs), this provides
 * proper scrolling that InlineEditField lacks.
 *
 * For short body blocks, behavior is identical to InlineEditField.
 */

import React from "react"
import { EditContextDisplay, useContentRect, useEditContext } from "@silvery/ag-react"

interface BodyEditFieldProps {
  initialValue: string
  onConfirm: (newValue: string) => void
  onCancel: () => void
  onSave?: (newValue: string) => void
  onSplitAtBoundary?: (offset: number) => void
  onMergeBackward?: () => void
  initialCursorPos?: "start" | "end" | number
  stickyX?: number
  /** Max visible height in rows. Omit for unlimited (no scrolling). */
  maxHeight?: number
}

export function BodyEditField({
  initialValue,
  onConfirm,
  onCancel,
  onSave,
  onSplitAtBoundary,
  onMergeBackward,
  initialCursorPos,
  stickyX,
  maxHeight,
}: BodyEditFieldProps): React.ReactElement {
  const { width } = useContentRect()

  const { value, cursor } = useEditContext({
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

  return (
    <EditContextDisplay
      value={value}
      cursor={cursor}
      wrapWidth={width > 0 ? width : undefined}
      height={maxHeight}
      cursorStyle="block"
    />
  )
}
