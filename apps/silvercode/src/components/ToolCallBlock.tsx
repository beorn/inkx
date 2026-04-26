import React, { useState } from "react"
import { Box, Muted, Small, Spinner, Text } from "silvery"
import { DiffRenderer } from "./DiffRenderer.tsx"
import { MarkdownView } from "./MarkdownView.tsx"

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

/**
 * Pick out fields that hold natural-language prose so we can render them
 * as markdown when the user expands a tool call. Everything else falls
 * back to the JSON dump so we never lose information silently.
 *
 * Tools like Agent (Task) carry the bulk of their meaning in `prompt` /
 * `description`; rendering those as markdown gives readable formatting
 * for headings, lists, and code spans the prompt may already contain.
 */
const MARKDOWN_FIELDS = ["prompt", "description", "instructions", "content"] as const

function pickMarkdownField(input: unknown): { field: string; text: string; rest: Record<string, unknown> } | null {
  if (!input || typeof input !== "object") return null
  const o = input as Record<string, unknown>
  for (const f of MARKDOWN_FIELDS) {
    const v = o[f]
    if (typeof v === "string" && v.length > 0) {
      const rest: Record<string, unknown> = {}
      for (const k of Object.keys(o)) if (k !== f) rest[k] = o[k]
      return { field: f, text: v, rest }
    }
  }
  return null
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
      backgroundColor={expanded ? "$surfacebg" : "$mutedbg"}
      borderStyle="single"
      borderColor={expanded ? "$accent" : "$border"}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      onClick={() => setExpanded((v) => !v)}
    >
      <Box flexDirection="row" gap={1}>
        {running ? <Spinner type="dots" /> : <Text color="$accent">⚙</Text>}
        <Text bold color="$primary">
          {display}
        </Text>
        {/* Collapsed: clip to a single line so a multi-line bash command or
            a wide URL doesn't blow the row to several rows of unwrapped
            metadata — the user has the chevron to expand if they want the
            full content. Expanded: wrap so the same label still reads as
            a header above the detailed body. */}
        {label && (
          <Box flexShrink={1} minWidth={0}>
            <Muted wrap={expanded ? "wrap" : "truncate"}>{label}</Muted>
          </Box>
        )}
        <Box flexGrow={1} />
        <Small>{expanded ? "▾" : "▸"}</Small>
      </Box>
      {expanded && (
        <Box paddingLeft={2} flexDirection="column">
          {(() => {
            // Edit tools: dedicated diff renderer (already covered).
            if (name === "Edit" && input && typeof input === "object" && "old_string" in input && "new_string" in input) {
              const o = input as Record<string, unknown>
              return (
                <DiffRenderer
                  oldText={String(o.old_string ?? "")}
                  newText={String(o.new_string ?? "")}
                  filePath={typeof o.file_path === "string" ? String(o.file_path) : undefined}
                />
              )
            }
            // Tools whose meaningful payload is a markdown-bearing string
            // (Agent.prompt, custom MCP tools with description fields, etc.):
            // render that field through MarkdownView and dump the rest as JSON
            // so structured params still show up.
            const md = pickMarkdownField(input)
            if (md) {
              const restKeys = Object.keys(md.rest)
              return (
                <Box flexDirection="column" gap={restKeys.length > 0 ? 1 : 0}>
                  <Box flexDirection="column">
                    <Muted>{md.field}:</Muted>
                    <MarkdownView source={md.text} />
                  </Box>
                  {restKeys.length > 0 && <Text wrap="wrap">{JSON.stringify(md.rest, null, 2)}</Text>}
                </Box>
              )
            }
            return <Text wrap="wrap">{JSON.stringify(input, null, 2)}</Text>
          })()}
        </Box>
      )}
    </Box>
  )
}
