import React, { useState } from "react"
import { Box, Muted, Small, Text } from "silvery"

/**
 * Preview of a tool result — up to PREVIEW_LINES lines, each clamped to
 * PREVIEW_LINE_CHARS. Keeps the line structure so multi-line output (git
 * output, cat, etc.) reads naturally in the collapsed state. Returns a
 * single string with "\n" between lines; the rendering Box handles wrap.
 */
const PREVIEW_LINES = 3
const PREVIEW_LINE_CHARS = 120

function previewLines(output: unknown): { lines: string[]; hasMore: boolean } {
  const raw = typeof output === "string" ? output : JSON.stringify(output, null, 2)
  if (!raw) return { lines: [], hasMore: false }
  const allLines = raw.split("\n")
  const head = allLines
    .slice(0, PREVIEW_LINES)
    .map((l) => (l.length > PREVIEW_LINE_CHARS ? `${l.slice(0, PREVIEW_LINE_CHARS)}…` : l))
  return { lines: head, hasMore: allLines.length > PREVIEW_LINES }
}

export function ToolResultBlock({ output, isError }: { output: unknown; isError?: boolean }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const { lines: preview, hasMore } = previewLines(output)
  const full = typeof output === "string" ? output : JSON.stringify(output, null, 2)
  const accentColor = isError ? "$error" : "$accent"
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingLeft={3}
      minWidth={0}
      backgroundColor={expanded ? "$surfacebg" : undefined}
      borderStyle="single"
      borderColor={expanded ? accentColor : "$border"}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      onClick={() => setExpanded((v) => !v)}
    >
      <Box flexDirection="row" gap={1} minWidth={0}>
        <Text color={isError ? "$error" : "$success"}>{isError ? "✗" : "↳"}</Text>
        {/* Preview lines stack in their own column with wrap; each line
            can break naturally onto multiple visual lines while the
            expand caret stays at the top of the row. */}
        <Box flexDirection="column" flexGrow={1} minWidth={0}>
          {preview.map((line, i) => (
            <Muted key={i} wrap="wrap">
              {line}
            </Muted>
          ))}
          {hasMore && !expanded && <Muted>…</Muted>}
        </Box>
        <Small>{expanded ? "▾" : "▸"}</Small>
      </Box>
      {expanded && (
        <Box paddingLeft={2} minWidth={0}>
          <Text color={isError ? "$error" : undefined} wrap="wrap">
            {full}
          </Text>
        </Box>
      )}
    </Box>
  )
}
