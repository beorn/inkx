import React from "react"
import { Box, Text } from "silvery"
import { MarkdownView } from "./MarkdownView.tsx"

export function AssistantBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text bold color="$primary">
        ●
      </Text>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <MarkdownView source={text} />
      </Box>
    </Box>
  )
}
