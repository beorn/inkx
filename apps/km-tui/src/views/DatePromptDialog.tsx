/**
 * Date Prompt Dialog Component
 *
 * Inline dialog for entering dates, start dates, or recurrence rules.
 * Uses useEditContext for text input and dialogTargetRef for Enter/Escape.
 */
import React from "react"
import { Box, Text, useEditContext } from "inkx"
import { resolveRelativeDate } from "@km/core"
import { naturalToRRule } from "@km/storage"
import { ModalDialog } from "./shared-components.tsx"
import { dialogTargetRef } from "../dialog-target.ts"

export interface DatePromptDialogProps {
  field: "due_at" | "start_at" | "recurrence"
  currentValue: string
  /** Callback when confirmed (dispatches DATE_PROMPT_CONFIRM) */
  onConfirm: () => void
  /** Callback when cancelled */
  onCancel: () => void
  width: number
  height: number
}

/** Get live preview text for the current input */
function getPreview(field: string, input: string): { text: string; color: string } {
  const trimmed = input.trim()
  if (!trimmed) return { text: "Empty = clear value", color: "gray" }

  if (field === "recurrence") {
    const rrule = naturalToRRule(trimmed)
    if (rrule) return { text: rrule, color: "green" }
    return { text: "Invalid recurrence", color: "red" }
  }

  const resolved = resolveRelativeDate(trimmed)
  if (resolved) {
    const timeStr = resolved.time ? ` ${resolved.time}` : ""
    return { text: `${resolved.date}${timeStr}`, color: "green" }
  }

  return { text: "Cannot parse date", color: "red" }
}

const FIELD_TITLES: Record<string, string> = {
  due_at: "Set Due Date",
  start_at: "Set Start Date",
  recurrence: "Set Recurrence",
}

const FIELD_HINTS: Record<string, string> = {
  due_at: "today, fri, +3d, jan 15, next tue 3pm, 2026-03-01",
  start_at: "today, fri, +3d, jan 15, next tue 3pm, 2026-03-01",
  recurrence: "daily, every week, every mon, every 2 weeks, monthly",
}

export function DatePromptDialog({
  field,
  currentValue,
  onConfirm,
  onCancel,
  width,
  height,
}: DatePromptDialogProps): React.ReactElement {
  // EditContext-based text editing
  const editCtx = useEditContext({
    initialValue: currentValue,
    onConfirm: () => onConfirm(),
    onCancel: () => onCancel(),
  })

  // Register dialog target for Enter/Escape.
  // IMPORTANT: Must go through editCtx.target.confirm/cancel to set cancelledRef,
  // otherwise useEditContext's auto-save-on-unmount fires onConfirm again.
  const { target: editTarget } = editCtx
  React.useLayoutEffect(() => {
    dialogTargetRef.current = {
      navUp() {},
      navDown() {},
      confirm() {
        editTarget.confirm()
      },
      cancel() {
        editTarget.cancel()
      },
    }
    return () => {
      dialogTargetRef.current = null
    }
  }, [editTarget])

  const title = FIELD_TITLES[field] ?? "Set Value"
  const hint = FIELD_HINTS[field] ?? ""
  const preview = getPreview(field, editCtx.value)

  return (
    <ModalDialog
      title={title}
      width={width}
      height={height}
      footer="Enter confirm  Esc cancel"
    >
      {/* Input field */}
      <Box borderStyle="round" borderColor="cyan" flexShrink={0}>
        <Text>
          <Text color="white">{"> "}</Text>
          {editCtx.beforeCursor}
          <Text inverse>{editCtx.afterCursor.length > 0 ? editCtx.afterCursor[0] : " "}</Text>
          {editCtx.afterCursor.length > 1 ? editCtx.afterCursor.slice(1) : ""}
        </Text>
      </Box>

      {/* Live preview */}
      <Box>
        <Text color={preview.color}>{preview.text}</Text>
      </Box>

      {/* Hint */}
      <Box>
        <Text dimColor>e.g. {hint}</Text>
      </Box>
    </ModalDialog>
  )
}
