import React, { useState } from "react"
import { Box, Muted, Small, Spinner, Text } from "silvery"
import { useInput } from "silvery/runtime"
import { DiffRenderer } from "./DiffRenderer.tsx"

/** Compact one-line summary when collapsed, pretty-printed JSON when expanded. */
function summarize(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const o = input as Record<string, unknown>
  if (name === "Bash" && typeof o.command === "string") return String(o.command)
  if ((name === "Read" || name === "Edit" || name === "Write") && typeof o.file_path === "string") {
    return String(o.file_path)
  }
  if (name === "Grep" && typeof o.pattern === "string") return String(o.pattern)
  if (name === "Glob" && typeof o.pattern === "string") return String(o.pattern)
  if (name === "TodoWrite" && Array.isArray(o.todos)) return `${o.todos.length} todos`
  if (name === "WebFetch" && typeof o.url === "string") return String(o.url)
  if (name === "Agent" && typeof o.description === "string") return String(o.description)
  return ""
}

export function ToolCallBlock({
  id,
  name,
  input,
  mcpServer,
  running,
}: {
  id: string
  name: string
  input: unknown
  mcpServer?: string
  /**
   * true when no tool-result has arrived yet — renders a pulsing
   * spinner in the row's leading glyph slot so the user sees which
   * tool is actively executing. Matches Claude Code's in-progress
   * visualization.
   */
  running?: boolean
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const label = summarize(name, input)
  const display = mcpServer ? `${mcpServer}:${name}` : name

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      minWidth={0}
      backgroundColor={expanded ? "$surfacebg" : "$mutedbg"}
      borderStyle="single"
      borderColor={expanded ? "$accent" : "$border"}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      onClick={() => setExpanded((v) => !v)}
    >
      <Box flexDirection="row" gap={1} minWidth={0}>
        {running ? <Spinner type="dots" /> : <Text color="$accent">⚙</Text>}
        <Text bold color="$primary">
          {display}
        </Text>
        {label && (
          <Box flexShrink={1} minWidth={0}>
            <Muted wrap="wrap">{label}</Muted>
          </Box>
        )}
        <Box flexGrow={1} />
        <Small>{expanded ? "▾" : "▸"}</Small>
      </Box>
      {expanded && (
        // minWidth={0} + overflow="hidden" so a long JSON line or nested
        // DiffRenderer can't push the expanded body past the card width.
        // The Text inside also gets wrap="wrap" so paragraph-shaped values
        // still line-break normally; truly unwrappable tokens (long paths,
        // URLs without whitespace) clip at the right edge via overflow.
        <Box paddingLeft={2} minWidth={0} overflow="hidden">
          {name === "Edit" && input && typeof input === "object" && "old_string" in input && "new_string" in input ? (
            <DiffRenderer
              oldText={String((input as Record<string, unknown>).old_string ?? "")}
              newText={String((input as Record<string, unknown>).new_string ?? "")}
              filePath={
                typeof (input as Record<string, unknown>).file_path === "string"
                  ? String((input as Record<string, unknown>).file_path)
                  : undefined
              }
            />
          ) : (
            <Text wrap="wrap">{JSON.stringify(input, null, 2)}</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
