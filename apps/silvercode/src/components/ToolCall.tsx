/**
 * <ToolCall>
 *
 * Canonical ACP `ToolCall` renderer. Drives header (status-animated title +
 * location chip), body (per-kind layout — Diff for `edit`, TerminalContent
 * for `execute`, TextContent for the rest), and error envelope (failed
 * status). Tool result content merged directly into the body —
 * no separate component.
 *
 * Component family (all in `apps/silvercode/src/components/`):
 *   - <ToolCall>             — this component, top-level card
 *   - <ToolCallStatusTitle>  — animated header morph
 *   - <ToolCallError>        — failed-status envelope
 *   - <ToolCallSummary>      — aggregate "Read 12 files" with rolling count
 *   - <ApplyPatch>           — Aider search/replace renderer
 *
 * Naming follows ACP exactly per `hub/silvery/future/ai-terminal/acp-naming.md`
 * — variables use `toolCall` / `toolCallId`, status enum from acp-types.ts,
 * file is `ToolCall.tsx` (ACP-aligned naming).
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React, { useState } from "react"
import { Box, Diff as SilveryDiff, type DiffHunk, Muted, Small, Spinner, Text } from "silvery"
import type { ToolCall as ToolCallType, ToolCallContent, ToolCallLocation, ContentBlock } from "@km/agent-harness"
import { ToolCallStatusTitle } from "./ToolCallStatusTitle.tsx"
import { ToolCallError } from "./ToolCallError.tsx"

// =============================================================================
// Helpers — derive renderable shapes from ACP `ToolCall` content variants.
// =============================================================================

/**
 * Build a single `DiffHunk` from an ACP `Diff` content variant. ACP's `Diff`
 * is two strings (oldText / newText) plus a path; the line-by-line hunk
 * shape silvery's `<Diff>` consumes is derived by splitting both on "\n"
 * and producing one hunk that spans the whole file. Real diff viewers do
 * Myers/LCS reduction; for v1 we punt and show the full old/new pair so
 * the user sees the shape without us re-implementing diff logic here.
 */
function diffContentToHunks(content: { newText: string; oldText?: string | null }): DiffHunk[] {
  const oldLines = (content.oldText ?? "").split("\n")
  const newLines = content.newText.split("\n")
  // Render every old line as a remove and every new line as an add. This
  // is structurally lossy vs a real diff but matches what ACP gives us
  // (two opaque strings) without hiding information. The mutable array
  // satisfies `DiffHunk["lines"]` (a `ReadonlyArray<DiffLine>`) at the
  // hunk-construction site below.
  const lines: { kind: "context" | "add" | "remove"; text: string }[] = []
  for (const text of oldLines) lines.push({ kind: "remove", text })
  for (const text of newLines) lines.push({ kind: "add", text })
  return [{ oldStart: 1, newStart: 1, lines }]
}

/**
 * Render a single ACP `ContentBlock`. Image/audio/resource variants render
 * as a placeholder note — terminals can't display images, but we surface
 * the metadata so the user knows content was emitted.
 */
function renderContentBlock(block: ContentBlock, key: number | string): React.ReactElement {
  if (block.type === "text") {
    return (
      <Text key={key} wrap="wrap">
        {block.text}
      </Text>
    )
  }
  if (block.type === "image") {
    return <Muted key={key}>[image: {block.mimeType}]</Muted>
  }
  if (block.type === "audio") {
    return <Muted key={key}>[audio: {block.mimeType}]</Muted>
  }
  if (block.type === "resource_link") {
    return (
      <Muted key={key}>
        [resource: {block.name} → {block.uri}]
      </Muted>
    )
  }
  // EmbeddedResource — render the inline text if it's a TextResourceContents.
  if ("text" in block.resource) {
    return (
      <Box key={key} flexDirection="column">
        <Muted>resource: {block.resource.uri}</Muted>
        <Text wrap="wrap">{block.resource.text}</Text>
      </Box>
    )
  }
  return <Muted key={key}>[blob: {block.resource.uri}]</Muted>
}

/**
 * Per-content-variant body renderer. ACP `ToolCallContent` discriminates on
 * `type`: "content" (text/image/etc.), "diff" (structured diff), "terminal"
 * (live terminal reference). The terminal variant renders as a placeholder
 * in v1 — wiring real terminal playback to a `<TerminalContent>` widget is
 * a follow-up bead.
 */
function renderContent(content: ToolCallContent, key: number): React.ReactElement {
  if (content.type === "content") {
    return <Box key={key}>{renderContentBlock(content.content, key)}</Box>
  }
  if (content.type === "diff") {
    const hunks = diffContentToHunks(content)
    return (
      <Box key={key} flexDirection="column">
        <Muted>--- {content.path}</Muted>
        <SilveryDiff hunks={hunks} mode="unified" showLineNumbers />
      </Box>
    )
  }
  // terminal
  return (
    <Box key={key}>
      <Muted>[terminal: {content.terminalId}]</Muted>
    </Box>
  )
}

/**
 * Compact location chip for the header — "src/foo.ts:42" or "src/foo.ts"
 * if no line. Multiple locations render as a comma-separated list,
 * truncating after 3 to keep the header single-row.
 */
function renderLocations(locations: ReadonlyArray<ToolCallLocation> | undefined): React.ReactElement | null {
  if (!locations || locations.length === 0) return null
  const visible = locations.slice(0, 3)
  const more = locations.length - visible.length
  const text = visible.map((loc) => (loc.line != null ? `${loc.path}:${loc.line}` : loc.path)).join(", ")
  return (
    <Box flexShrink={1} minWidth={0}>
      <Muted wrap="truncate">
        {text}
        {more > 0 ? ` +${more}` : ""}
      </Muted>
    </Box>
  )
}

// =============================================================================
// Component
// =============================================================================

export interface ToolCallProps {
  /** The ACP `ToolCall` to render. */
  toolCall: ToolCallType
  /**
   * When `status === "failed"`, this is the error message rendered by the
   * envelope. Optional — falls back to a generic label. Caller typically
   * extracts the message from `toolCall.rawOutput` or a content block.
   */
  errorMessage?: string
  /**
   * Optional retry hook. Forwarded to `<ToolCallError>` when the call has
   * failed; ignored otherwise.
   */
  onRetry?: () => void
  /**
   * Initial expanded state for the body. Defaults to expanded for failed
   * calls (errors hide nothing) and collapsed otherwise. Caller can flip
   * this to seed a stream as fully-expanded for replay/debug views.
   */
  defaultExpanded?: boolean
}

/**
 * Canonical ACP `<ToolCall>` renderer — one card, kind/status driven.
 */
export function ToolCall({ toolCall, errorMessage, onRetry, defaultExpanded }: ToolCallProps): React.ReactElement {
  const status = toolCall.status ?? "pending"
  const kind = toolCall.kind ?? "other"
  // Default expand: failed calls show the body up-front; everything else
  // collapses so a long stream stays scannable.
  const initial = defaultExpanded ?? status === "failed"
  const [expanded, setExpanded] = useState(initial)

  const accentColor = status === "failed" ? "$error" : "$accent"
  const hasContent = (toolCall.content?.length ?? 0) > 0

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        paddingX={1}
        backgroundColor={expanded ? "$surfacebg" : "$mutedbg"}
        borderStyle="single"
        borderColor={expanded ? accentColor : "$border"}
        borderTop={false}
        borderBottom={false}
        borderRight={false}
        onClick={hasContent ? () => setExpanded((v) => !v) : undefined}
      >
        <Box flexDirection="row" gap={1}>
          {/* Leading glyph — spinner for in_progress, ⚙ otherwise. The
              spinner gets eaten by static-frame tests but in real TTY it
              animates the same way Claude Code's tool-row spinner does. */}
          {status === "in_progress" ? <Spinner type="dots" /> : <Text color={accentColor}>⚙</Text>}
          <ToolCallStatusTitle status={status} kind={kind} title={toolCall.title} />
          {renderLocations(toolCall.locations)}
          <Box flexGrow={1} />
          {hasContent ? <Small>{expanded ? "▾" : "▸"}</Small> : null}
        </Box>
        {expanded && hasContent ? (
          <Box paddingLeft={2} flexDirection="column">
            {(toolCall.content ?? []).map((c, i) => renderContent(c, i))}
          </Box>
        ) : null}
      </Box>
      {/* Failed calls render an error envelope below the header. The
          envelope is structurally part of the same card (no gap), but
          carries its own border+coloring so the failure stands out. */}
      {status === "failed" ? <ToolCallError message={errorMessage ?? "Tool call failed"} onRetry={onRetry} /> : null}
    </Box>
  )
}
