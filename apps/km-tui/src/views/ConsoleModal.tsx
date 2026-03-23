/**
 * Console Modal Component
 *
 * Displays debug/log output in a scrollable overlay.
 * Auto-opens on first output, can be toggled with backtick.
 */
import React, { forwardRef, useImperativeHandle } from "react"
import {
  Box,
  ErrorBoundary,
  Text,
  Small,
  stripAnsi,
  useConsole,
  ModalDialog,
  type PatchedConsole,
} from "@silvery/ag-react"

const MAX_LINES = 100

interface ConsoleModalHandle {
  scrollToBottom(): void
}

interface ConsoleModalProps {
  width: number
  height: number
  patchedConsole: PatchedConsole
}

export const ConsoleModal = forwardRef<ConsoleModalHandle, ConsoleModalProps>(function ConsoleModal(
  { width, height, patchedConsole },
  ref,
) {
  // useConsole is debounced (200ms) to prevent infinite render loops
  // when pipeline debug logging is enabled (-vv).
  const entries = useConsole(patchedConsole)

  // Expose imperative handle for parent components
  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      // No-op for now - silvery Box doesn't expose imperative scroll yet
      // Documents the intent for future implementation
    },
  }))

  // Take last MAX_LINES entries
  const visibleEntries = entries.slice(-MAX_LINES)

  // Calculate dimensions — wider than other dialogs for log readability
  const boxWidth = Math.min(100, Math.floor((width * 2) / 3))
  const boxHeight = Math.min(height - 6, Math.floor((height * 2) / 3))
  const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
  const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

  // Content height for scrolling (subtract borders + padding + title + spacer + footer_spacer + footer)
  // Same calculation as SearchDialog: height - 11
  const contentHeight = Math.max(3, boxHeight - 11)

  return (
    <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop}>
      <ModalDialog
        width={boxWidth}
        title="Console"
        titleAlign="flex-start"
        footer={`\` or Esc to close  ·  ${entries.length} entries (last ${MAX_LINES})`}
        footerAlign="flex-start"
      >
        {/* Scrollable content */}
        <Box flexDirection="column" height={contentHeight} overflow="scroll">
          <ErrorBoundary fallback={<Text color="$error">Console error</Text>}>
            {visibleEntries.length === 0 ? (
              <Small>No console output yet</Small>
            ) : (
              visibleEntries.map((entry, i) => (
                <Text key={i} color={getColorForMethod(entry.method)} wrap="truncate">
                  {formatEntry(entry)}
                </Text>
              ))
            )}
          </ErrorBoundary>
        </Box>
      </ModalDialog>
    </Box>
  )
})

function getColorForMethod(method: string): string {
  switch (method) {
    case "error":
      return "$error"
    case "warn":
      return "$warning"
    case "info":
      return "$primary"
    default:
      // console.log and console.debug — white for readability
      return "$fg"
  }
}

function formatEntry(entry: { method: string; args: unknown[] }): string {
  const raw = entry.args
    .map((arg) => {
      if (typeof arg === "string") return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
  // Strip ANSI codes (Text component applies its own color via props)
  // and collapse newlines/carriage returns to avoid blank lines between entries
  return stripAnsi(raw)
    .replace(/[\r\n]+/g, " ")
    .trim()
}
