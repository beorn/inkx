/**
 * Date Prompt Dialog Component
 *
 * Inline dialog for entering dates, start dates, or recurrence rules.
 * Uses the same dialogTargetRef + blockEditTargetRef pattern as NewItemDialog.
 */
import React, { useState } from "react"
import { Box, Text } from "inkx"
import { formatDate, formatTime, resolveRelativeDate } from "@km/core"
import { naturalToRRule } from "@km/storage"
import { ModalDialog } from "./shared-components.tsx"
import { dialogTargetRef } from "../dialog-target.ts"
import { blockEditTargetRef, type BlockEditTarget } from "../block-edit-target.ts"

export interface DatePromptDialogProps {
  field: "due_date" | "scheduled_date" | "recurrence"
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
  const [content, setContent] = useState(currentValue)

  const contentRef = React.useRef(content)
  contentRef.current = content
  const onConfirmRef = React.useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel

  // Register dialog target and block edit target
  React.useLayoutEffect(() => {
    dialogTargetRef.current = {
      navUp() {},
      navDown() {},
      confirm() {
        onConfirmRef.current()
      },
      cancel() {
        onCancelRef.current()
      },
    }

    const textTarget: BlockEditTarget = {
      insertChar(char: string) {
        setContent((c) => c + char)
      },
      deleteBackward() {
        setContent((c) => c.slice(0, -1))
      },
      deleteForward() {},
      cursorLeft() {},
      cursorRight() {},
      cursorStart() {},
      cursorEnd() {},
      deleteWord() {
        setContent((c) => {
          const trimmed = c.trimEnd()
          const lastSpace = trimmed.lastIndexOf(" ")
          return lastSpace === -1 ? "" : trimmed.slice(0, lastSpace)
        })
      },
      deleteToStart() {
        setContent("")
      },
      deleteToEnd() {},
      confirm() {
        onConfirmRef.current()
      },
      cancel() {
        onCancelRef.current()
      },
      save() {},
      getCursorOffset() {
        return contentRef.current.length
      },
      getContent() {
        return contentRef.current
      },
    }
    blockEditTargetRef.current = textTarget

    return () => {
      dialogTargetRef.current = null
      if (blockEditTargetRef.current === textTarget) {
        blockEditTargetRef.current = null
      }
    }
  }, [])

  const title = FIELD_TITLES[field] ?? "Set Value"
  const hint = FIELD_HINTS[field] ?? ""
  const preview = getPreview(field, content)

  return (
    <ModalDialog
      title={title}
      width={width}
      height={Math.min(height, 12)}
      footer="Enter confirm  Esc cancel"
    >
      {/* Input field */}
      <Box borderStyle="round" borderColor="cyan" flexShrink={0}>
        <Text>
          <Text color="white">{"> "}</Text>
          <Text>{content}</Text>
          <Text inverse> </Text>
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
