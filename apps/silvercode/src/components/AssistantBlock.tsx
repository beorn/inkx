import React from "react"
import { Box, Prose, Text } from "silvery"
import { MarkdownView } from "./MarkdownView.tsx"

export function AssistantBlock({ text }: { text: string }): React.ReactElement {
  // flexShrink/minWidth on the outer row are load-bearing for wrap:
  // without them, flexily sizes this row at the sum of its children's
  // intrinsic widths, which feeds a wide measure to MarkdownView's
  // per-Text `wrap="wrap"` and defeats soft-wrapping. CSS §4.5's
  // overflow→min-size:0 rule only applies to the immediate child of
  // the overflow container; intermediate flex rows between the
  // SessionCard root and the Prose body still need explicit shrinkability.
  // The inner column uses <Prose> which encapsulates the same chain.
  return (
    <Box flexDirection="row" gap={1} paddingX={1} flexShrink={1} minWidth={0}>
      <Text bold color="$primary">
        ●
      </Text>
      <Prose flexGrow={1}>
        <MarkdownView source={text} />
      </Prose>
    </Box>
  )
}
