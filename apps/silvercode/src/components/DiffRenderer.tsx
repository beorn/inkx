import React from "react"
import { Box, Text } from "silvery"

/**
 * Two-column diff for the Edit tool's `{old_string, new_string}` payload.
 *
 * Intentionally simple — line-split both sides, show removed in red and added
 * in green with gutter markers. A proper LCS diff (Myers) lands when
 * @silvery/syntax matures; for M8 this is enough to see what's changing.
 */
export function DiffRenderer({
  oldText,
  newText,
  filePath,
}: {
  oldText: string
  newText: string
  filePath?: string
}): React.ReactElement {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border" paddingX={1}>
      {filePath && <Text color="$muted">--- {filePath}</Text>}
      {oldLines.map((line, i) => (
        <Box key={`o${i}`} flexDirection="row">
          <Text color="$error">- </Text>
          <Text color="$error">{line}</Text>
        </Box>
      ))}
      {newLines.map((line, i) => (
        <Box key={`n${i}`} flexDirection="row">
          <Text color="$success">+ </Text>
          <Text color="$success">{line}</Text>
        </Box>
      ))}
    </Box>
  )
}
