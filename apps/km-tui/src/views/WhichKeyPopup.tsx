/**
 * Which-key transient popup — shows available chord suffixes when a chord
 * prefix is pending. Renders immediately when pendingChord is set (the chord
 * state machine ensures fast completions clear it before the next render).
 * Disappears instantly when a suffix or Escape is pressed.
 *
 * Layout: vertical list anchored above the command box. Each entry is one row:
 *   k label
 */
import React, { useState, useEffect, useRef } from "react"
import { Box, Text } from "inkx"
import { getChordSuffixes, getCommand, locationLabel } from "@km/commands"

/** Get display label for a chord suffix entry */
function getLabel(commandId: string, targetId?: string): string {
  // Composable commands: derive label from target
  if (targetId) return locationLabel(targetId)
  // Other commands: use shortLabel or name
  if (commandId === "noop") return "..."
  const cmd = getCommand(commandId)
  if (!cmd) return commandId
  return cmd.shortLabel ?? cmd.name
}

interface CommandFeedbackProps {
  prefix?: string
  bellState?: string
  status?: { level: string; message: string } | null
  /** Local search state — shows match count or "No matches" */
  localSearch?: { query: string; matchIndex: number; matchCount: number } | null
  termWidth: number
}

const STATUS_COLORS: Record<string, string | undefined> = {
  info: undefined,
  success: "green",
  warning: "yellow",
  error: "red",
}

const FLASH_MS = 300
const MAX_FLASH_WIDTH = 44 // 40 content + 4 border/padding

/** Flash white on new message, then fade to normal color */
function useFlash(message: string | undefined): boolean {
  const [flash, setFlash] = useState(true)
  const prevRef = useRef(message)

  useEffect(() => {
    if (message !== prevRef.current) {
      prevRef.current = message
      setFlash(true)
    }
    if (!message) return
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    const timer = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [message])

  return flash
}

/**
 * FlashMessage — rounded bordered message that flashes white then fades to a normal color.
 *
 * Used for transient feedback: bell alerts, status messages, search match counts.
 * On first appearance (or message change), renders with white border + bold white text
 * for 300ms, then transitions to gray border + the specified color.
 */
export function FlashMessage({ message, color, termWidth }: {
  message: string
  /** Text color after flash (undefined = default terminal color) */
  color?: string
  termWidth?: number
}): React.ReactElement {
  const isFlash = useFlash(message)
  const maxWidth = Math.min(MAX_FLASH_WIDTH, termWidth ?? MAX_FLASH_WIDTH)
  return (
    <Box
      width={Math.min(message.length + 4, maxWidth)}
      borderStyle="round"
      borderColor={isFlash ? "white" : "gray"}
      paddingX={1}
      paddingY={0}
    >
      <Text color={isFlash ? "white" : color} bold={isFlash} id="feedback-message">{message}</Text>
    </Box>
  )
}

export function CommandFeedback({ prefix, bellState, status, localSearch, termWidth }: CommandFeedbackProps): React.ReactElement | null {
  // Priority 1: chord hints (existing behavior)
  if (prefix) {
    const suffixes = getChordSuffixes(prefix)
    if (suffixes.length === 0) return null

    const entries = suffixes.map((s) => ({
      key: s.key,
      label: getLabel(s.commandId, s.targetId),
    }))

    const maxEntryWidth = Math.max(...entries.map((e) => 1 + 1 + e.label.length))
    const popupWidth = Math.min(maxEntryWidth + 4, MAX_FLASH_WIDTH, termWidth)

    return (
      <Box
        width={popupWidth}
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={1}
      >
        {entries.map((entry) => (
          <Text key={entry.key}>
            <Text color="yellow" bold>
              {entry.key}
            </Text>{" "}
            <Text dimColor>{entry.label}</Text>
          </Text>
        ))}
      </Box>
    )
  }

  // Priority 2: bell/status feedback
  if (bellState || status) {
    const message = status?.message ?? bellState ?? ""
    const color = bellState ? undefined : status ? STATUS_COLORS[status.level] : undefined
    return <FlashMessage message={message} color={color} termWidth={termWidth} />
  }

  // Priority 3: local search match feedback
  if (localSearch && localSearch.query.length > 0) {
    const noMatches = localSearch.matchCount === 0
    const text = noMatches ? "No matches" : `${localSearch.matchIndex + 1} of ${localSearch.matchCount}`
    return <FlashMessage message={text} color={noMatches ? "red" : "yellow"} termWidth={termWidth} />
  }

  return null
}
