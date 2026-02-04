/**
 * Console Modal Component
 *
 * Displays debug/log output in a scrollable overlay.
 * Auto-opens on first output, can be toggled with backtick.
 */
import React, { forwardRef, useImperativeHandle } from "react"
import { Box, ErrorBoundary, Text, useConsole, type PatchedConsole } from "inkx"
import { ModalDialog } from "./shared-components.tsx"

const MAX_LINES = 100

interface ConsoleModalHandle {
  scrollToBottom(): void
}

interface ConsoleModalProps {
  width: number
  height: number
  patchedConsole: PatchedConsole
}

export const ConsoleModal = forwardRef<ConsoleModalHandle, ConsoleModalProps>(
  function ConsoleModal({ width, height, patchedConsole }, ref) {
    const entries = useConsole(patchedConsole)

    // Expose imperative handle for parent components
    useImperativeHandle(ref, () => ({
      scrollToBottom() {
        // No-op for now - inkx Box doesn't expose imperative scroll yet
        // Documents the intent for future implementation
      },
    }))

    // Take last MAX_LINES entries
    const visibleEntries = entries.slice(-MAX_LINES)

    // Calculate dimensions (same sizing as SearchDialog - 2/3 of screen)
    const boxWidth = Math.min(90, Math.floor((width * 2) / 3))
    const boxHeight = Math.min(height - 6, Math.floor((height * 2) / 3))
    const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
    const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

    // Content height for scrolling (subtract borders + padding + title + spacer + footer_spacer + footer)
    // Same calculation as SearchDialog: height - 11
    const contentHeight = Math.max(3, boxHeight - 11)

    return (
      <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop}>
        <ModalDialog
          borderColor="gray"
          width={boxWidth}
          title="Console"
          footer={`Press \` or Esc to close  ·  ${entries.length} entries (showing last ${MAX_LINES})`}
        >
          {/* Scrollable content */}
          <Box
            flexDirection="column"
            height={contentHeight}
            overflow="scroll"
            paddingX={1}
          >
            <ErrorBoundary fallback={<Text color="red">Console error</Text>}>
              {visibleEntries.length === 0 ? (
                <Text dimColor>No console output yet</Text>
              ) : (
                visibleEntries.map((entry, i) => (
                  <Text
                    key={i}
                    color={getColorForMethod(entry.method)}
                    wrap="truncate"
                  >
                    {formatEntry(entry)}
                  </Text>
                ))
              )}
            </ErrorBoundary>
          </Box>
        </ModalDialog>
      </Box>
    )
  },
)

function getColorForMethod(method: string): string {
  switch (method) {
    case "error":
      return "red"
    case "warn":
      return "yellow"
    case "debug":
      return "gray"
    case "info":
      return "cyan"
    default:
      // console.log - use white to ensure visibility on dark backgrounds
      return "white"
  }
}

function formatEntry(entry: { method: string; args: unknown[] }): string {
  const args = entry.args
    .map((arg) => {
      if (typeof arg === "string") return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
  return args
}
