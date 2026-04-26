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
 */
export function UserMessageBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box
      flexDirection="row"
      flexShrink={1}
      minWidth={0}
      gap={1}
      paddingX={1}
      paddingY={0}
      backgroundColor="$bg-surface-subtle"
    >
      <Text bold color="$accent">
        {">"}
      </Text>
      <Prose flexGrow={1} flexShrink={1} minWidth={0}>
        <LinkifiedText text={text} role="user" />
      </Prose>
    </Box>
  )
}
