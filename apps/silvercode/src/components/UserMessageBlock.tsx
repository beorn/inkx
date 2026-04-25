import React from "react"
import { Box, Prose, Text } from "silvery"
import { DetectionText } from "./DetectionText.tsx"

/**
 * User turn block. Sits with a subtle background and a small top/bottom pad
 * so user messages have visual breathing room — they were previously
 * flush-left plain text that blended into the cards region. Matches the
 * opencode "card-like" treatment of user input.
 */
export function UserMessageBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingX={1} paddingY={0} backgroundColor="$bg-surface-subtle">
      <Text bold color="$accent">
        {">"}
      </Text>
      <Prose flexGrow={1}>
        <DetectionText text={text} tone="user" />
      </Prose>
    </Box>
  )
}
