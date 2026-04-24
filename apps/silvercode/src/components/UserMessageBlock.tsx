import React from "react"
import { Box, Text } from "silvery"
import { DetectionText } from "./DetectionText.tsx"

export function UserMessageBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      <Text bold color="$accent">
        ▸
      </Text>
      <Box flexDirection="column">
        <DetectionText text={text} tone="user" />
      </Box>
    </Box>
  )
}
