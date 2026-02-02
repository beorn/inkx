/**
 * Console Modal Component
 *
 * Displays debug/log output in a scrollable overlay.
 * Auto-opens on first output, can be toggled with backtick.
 */
import React from "react"
import { Box, Text, useConsole, type PatchedConsole } from "inkx"
import { ModalDialog } from "./shared-components.tsx"

const MAX_LINES = 100

interface ConsoleModalProps {
  width: number
  height: number
  patchedConsole: PatchedConsole
}

export function ConsoleModal({ width, height, patchedConsole }: ConsoleModalProps) {
  const entries = useConsole(patchedConsole)

  // Take last MAX_LINES entries
  const visibleEntries = entries.slice(-MAX_LINES)

  // Calculate dimensions
  const boxWidth = Math.max(40, Math.min(width - 4, 120))
  const boxHeight = Math.max(10, height - 4)
  const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
  const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

  // Content height for scrolling (subtract header/footer)
  const contentHeight = boxHeight - 4

  return (
    <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop}>
      <ModalDialog borderColor="gray" width={boxWidth}>
        {/* Header */}
        <Box justifyContent="space-between" width={boxWidth - 4}>
          <Text color="gray" bold>
            Console
          </Text>
          <Text dimColor>
            {entries.length} entries (showing last {MAX_LINES})
          </Text>
        </Box>

        {/* Scrollable content */}
        <Box
          flexDirection="column"
          height={contentHeight}
          overflow="scroll"
          paddingX={1}
        >
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
        </Box>

        {/* Footer */}
        <Text dimColor>Press ` or Esc to close</Text>
      </ModalDialog>
    </Box>
  )
}

function getColorForMethod(method: string): string | undefined {
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
      return undefined
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
