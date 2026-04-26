import React from "react"
import { Box, Prose, Text } from "silvery"
import { LinkifiedText } from "./LinkifiedText.tsx"

/**
 * User turn block. Sits with a subtle background and a small top/bottom pad
 * so user messages have visual breathing room — they were previously
 * flush-left plain text that blended into the cards region. Matches the
 * opencode "card-like" treatment of user input.
 *
 * `flexShrink={1} minWidth={0}` on the row + Prose ensures long single-line
 * messages soft-wrap against the available width instead of overflowing the
 * card's right edge. Without explicit shrink, max-content sizing pushes the
 * row past the viewport on long pasted lines.
 *
 * `additionalContext` carries everything stripped from the on-disk JSONL
 * (system-reminders, hook output, isMeta entries). The chip below the
 * prompt summarizes it; `showRaw=true` (driven by the `/raw` slash
 * command) inlines the full body so debug sessions can see what the
 * model actually received. Bead:
 * `km-silvercode.resume-show-everything-collapsed`.
 */
export function UserMessageBlock({
  text,
  additionalContext,
  showRaw,
}: {
  text: string
  additionalContext?: string
  showRaw?: boolean
}): React.ReactElement {
  const hasContext = (additionalContext?.length ?? 0) > 0
  const isMetaOnly = text.length === 0 && hasContext
  const lineCount = additionalContext ? additionalContext.split("\n").length : 0
  return (
    <Box
      flexDirection="column"
      flexShrink={1}
      minWidth={0}
      backgroundColor="$bg-surface-subtle"
      paddingX={1}
      paddingY={0}
    >
      {!isMetaOnly && (
        <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
          <Text bold color="$accent">
            {">"}
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <LinkifiedText text={text} role="user" />
          </Prose>
        </Box>
      )}
      {hasContext && (
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text dimColor color="$muted">
            {showRaw ? "▾" : "▸"} {lineCount} line{lineCount === 1 ? "" : "s"} of hidden context (run `/raw` to toggle)
          </Text>
          {showRaw && (
            <Box flexDirection="column" flexShrink={1} minWidth={0} paddingLeft={2}>
              <Text dimColor wrap="wrap">
                {additionalContext}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
