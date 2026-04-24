import React, { useState } from "react"
import { Box, Muted, Small, Text } from "silvery"

function preview(output: unknown, maxLen = 180): string {
  if (typeof output === "string") {
    const trimmed = output.replace(/\s+/g, " ").trim()
    return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen) + "…"
  }
  const json = JSON.stringify(output)
  if (!json) return ""
  return json.length <= maxLen ? json : json.slice(0, maxLen) + "…"
}

export function ToolResultBlock({
  output,
  isError,
}: {
  output: unknown
  isError?: boolean
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const preview1 = preview(output)
  const full = typeof output === "string" ? output : JSON.stringify(output, null, 2)
  const accentColor = isError ? "$error" : "$accent"
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingLeft={3}
      backgroundColor={expanded ? "$surfacebg" : undefined}
      borderStyle="single"
      borderColor={expanded ? accentColor : "$border"}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      onClick={() => setExpanded((v) => !v)}
    >
      <Box flexDirection="row" gap={1}>
        <Text color={isError ? "$error" : "$success"}>{isError ? "✗" : "↳"}</Text>
        <Muted>{preview1}</Muted>
        <Box flexGrow={1} />
        <Small>{expanded ? "▾" : "▸"}</Small>
      </Box>
      {expanded && (
        <Box paddingLeft={2}>
          <Text color={isError ? "$error" : undefined}>{full}</Text>
        </Box>
      )}
    </Box>
  )
}
