import React from "react"
import { Box, Text } from "silvery"
import { MarkdownView } from "./MarkdownView.tsx"

export function AssistantBlock({ text }: { text: string }): React.ReactElement {
  // flexShrink/minWidth on the outer row are load-bearing for wrap:
  // without them, flexily sizes this row at the sum of its children's
  // intrinsic widths, which feeds a wide measure to MarkdownView's
  // per-Text `wrap="wrap"` and defeats soft-wrapping.
  return (
    <Box flexDirection="row" gap={1} paddingX={1} flexShrink={1} minWidth={0}>
      <Text bold color="$primary">
        ●
      </Text>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <MarkdownView source={text} />
      </Box>
    </Box>
  )
}
