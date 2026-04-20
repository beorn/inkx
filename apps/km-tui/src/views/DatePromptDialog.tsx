/**
 * Date Prompt Dialog Component
 *
 * Inline dialog for entering dates, start dates, or recurrence rules.
 * Uses useDialogInput for text input + dialogTargetRef wiring.
 */
import React from "react"
import { Box, Text, Small, Muted, CursorLine, ModalDialog } from "@silvery/ag-react"
import { resolveRelativeDate } from "@km/core"
import { naturalToRRule } from "@km/storage"
import { useDialogInput } from "../hooks/use-dialog-input.ts"

export interface DatePromptDialogProps {
  field: "due_at" | "start_at" | "rrule"
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
  if (!trimmed) return { text: "Empty = clear value", color: "$fg-muted" }

  if (field === "rrule") {
    const rrule = naturalToRRule(trimmed)
    if (rrule) return { text: rrule, color: "$fg-success" }
    return { text: "Invalid recurrence", color: "$fg-error" }
  }

  const resolved = resolveRelativeDate(trimmed)
  if (resolved) {
    const timeStr = resolved.time ? ` ${resolved.time}` : ""
    return { text: `${resolved.date}${timeStr}`, color: "$fg-success" }
  }

  return { text: "Cannot parse date", color: "$fg-error" }
}

const FIELD_TITLES: Record<string, string> = {
  due_at: "Set Due Date",
  start_at: "Set Start Date",
  rrule: "Set Recurrence",
}

const FIELD_HINTS: Record<string, string> = {
  due_at: "today, fri, +3d, jan 15, next tue 3pm, 2026-03-01",
  start_at: "today, fri, +3d, jan 15, next tue 3pm, 2026-03-01",
  rrule: "daily, every week, every mon, every 2 weeks, monthly",
}

export function DatePromptDialog({
  field,
  currentValue,
  onConfirm,
  onCancel,
  width,
  height,
}: DatePromptDialogProps): React.ReactElement {
  const editCtx = useDialogInput({
    initialValue: currentValue,
    onConfirm: () => onConfirm(),
    onCancel: () => onCancel(),
  })

  const title = FIELD_TITLES[field] ?? "Set Value"
  const hint = FIELD_HINTS[field] ?? ""
  const preview = getPreview(field, editCtx.value)

  return (
    <ModalDialog title={title} width={width} height={height} footer="Enter confirm  Esc cancel">
      {/* Input field */}
      <Box borderStyle="round" borderColor={"$border-focus"} flexShrink={0}>
        <Text>
          <Text color={"$fg"}>{"> "}</Text>
          <CursorLine beforeCursor={editCtx.beforeCursor} afterCursor={editCtx.afterCursor} />
        </Text>
      </Box>

      {/* Live preview */}
      <Box>
        {preview.color === "$fg-muted" ? (
          <Muted>{preview.text}</Muted>
        ) : (
          <Text color={preview.color}>{preview.text}</Text>
        )}
      </Box>

      {/* Hint */}
      <Box>
        <Small>e.g. {hint}</Small>
      </Box>
    </ModalDialog>
  )
}
