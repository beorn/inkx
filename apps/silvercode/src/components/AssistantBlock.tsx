import React from "react"
import { Box, Text } from "silvery"
import { MarkdownView } from "./MarkdownView.tsx"

export function AssistantBlock({ text }: { text: string }): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1} minWidth={0}>
      <Text bold color="$primary">
        ●
      </Text>
      {/* minWidth=0 on the content column lets long unwrappable tokens
          (URLs, identifiers without spaces) shrink-fit instead of
          pushing the whole row past the card width — which would push
          the side panel offscreen. */}
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <MarkdownView source={text} />
      </Box>
    </Box>
  )
}
