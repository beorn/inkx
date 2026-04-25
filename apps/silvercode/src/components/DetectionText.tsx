import React from "react"
import { Box, Muted, Prose, Text, usePopover } from "silvery"
import { detectReferences, type Detection } from "../detection.ts"
import { useAutolinks } from "../AutolinksContext.tsx"
import { detectAutolinks, mergeDetections } from "../autolinks/match.ts"
import { resolvePreview } from "../autolinks/previews.ts"
import type { AutolinkPreviewKind } from "../autolinks/config.ts"
import { MarkdownView } from "./MarkdownView.tsx"

/** Preview kinds whose body is markdown source — render via MarkdownView. */
function isMarkdownKind(kind: AutolinkPreviewKind): boolean {
  return kind === "readme" || kind === "first-paragraph"
}

/**
 * Decode the JSON-encoded `command` carried in the detection payload (per
 * `match.ts`). Returns `undefined` on any shape mismatch so a corrupt payload
 * doesn't crash the popover; the shell resolver will surface a clearer error.
 */
function safeParseCommand(s: string): { exec: string; args: string[] } | undefined {
  try {
    const parsed = JSON.parse(s) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { exec?: unknown }).exec === "string" &&
      Array.isArray((parsed as { args?: unknown }).args) &&
      (parsed as { args: unknown[] }).args.every((a) => typeof a === "string")
    ) {
      return parsed as { exec: string; args: string[] }
    }
  } catch {}
  return undefined
}

function renderAutolinkPopover(d: Detection): React.ReactNode {
  const preview = (d.payload.preview ?? "readme") as AutolinkPreviewKind
  const resolvesTo = d.payload.resolves_to ?? ""
  const cacheKey = d.payload.cache_key ?? d.match
  const commandJson = d.payload.command
  const command = commandJson ? safeParseCommand(commandJson) : undefined
  const result = resolvePreview({ preview, resolvesTo, cacheKey, command })
  if (result.kind === "error") {
    return (
      <Box flexDirection="column">
        <Text bold>{d.match}</Text>
        <Muted>resolves to {resolvesTo}</Muted>
        <Text color="$error">{result.message}</Text>
      </Box>
    )
  }
  // Markdown-source kinds (readme / first-paragraph) render through
  // MarkdownView — emphasis, code spans, headings, and bullets all carry
  // through. Shell, bd-active, and (defensively) mcp render as plain text
  // since their body is program output, not markdown.
  //
  // The popover is narrow (~50 cols typical). Wrap MarkdownView in a
  // <Prose flexShrink={1} minWidth={0}> so the inner Text nodes can shrink
  // to the popover width — without the explicit shrink/minWidth, Yoga
  // refuses to compress below a child's intrinsic size and the popover
  // expands to fit the longest line.
  return (
    <Box flexDirection="column">
      <Text bold>{d.match}</Text>
      <Muted>
        {preview} · {resolvesTo}
      </Muted>
      <Box flexDirection="column" paddingTop={1}>
        {isMarkdownKind(preview) ? (
          <Prose flexShrink={1} minWidth={0}>
            <MarkdownView source={result.body} />
          </Prose>
        ) : (
          result.body.split("\n").map((line, i) => (
            <Text key={i} wrap="wrap">
              {line.length === 0 ? " " : line}
            </Text>
          ))
        )}
      </Box>
    </Box>
  )
}

function renderPopoverContent(d: Detection): React.ReactNode {
  switch (d.kind) {
    case "bead":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.id}</Text>
          <Text>Bead details resolve via `bd show {d.payload.id}`.</Text>
        </Box>
      )
    case "file":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.path}</Text>
          {d.payload.line && <Text>line {d.payload.line}</Text>}
        </Box>
      )
    case "km-node":
      return (
        <Box flexDirection="column">
          <Text bold>km node {d.payload.id}</Text>
          <Text>Node summary resolves via km_get_node.</Text>
        </Box>
      )
    case "code-ref":
      return (
        <Box flexDirection="column">
          <Text bold>
            {d.payload.path}:{d.payload.line}
          </Text>
        </Box>
      )
    // Plain URLs land here as `kind: "autolink"` with `payload.virtual === "1"`
    // — the migration in `bd-km-silvercode.url-detection-via-handlers` removed
    // the dedicated `kind: "url"` branch in favor of the handler registry path.
    case "autolink":
      return renderAutolinkPopover(d)
  }
}

function colorFor(d: Detection): string {
  switch (d.kind) {
    case "bead":
      return "$accent"
    case "file":
      return "$primary"
    case "km-node":
      return "$accent"
    case "code-ref":
      return "$primary"
    case "autolink":
      // Virtual plain-URL detections inherit the legacy URL color so plain
      // links read like links. Configured autolinks keep `$secondary` to
      // distinguish rule-driven matches from raw URLs.
      return d.payload.virtual === "1" ? "$info" : "$secondary"
  }
}

export function DetectionText({ text, tone }: { text: string; tone?: "assistant" | "user" }): React.ReactElement {
  const popover = usePopover()
  const { rules } = useAutolinks()
  const detections = React.useMemo(() => {
    const builtins = detectReferences(text)
    if (rules.length === 0) return builtins
    const auto = detectAutolinks(text, rules)
    return mergeDetections(builtins, auto)
  }, [text, rules])

  // Each markdown line renders as a SINGLE outer <Text wrap="wrap"> with
  // nested styled Text spans for detected references. This is the only
  // shape that gives correct word-wrap across detection boundaries — the
  // earlier `<Box flexDirection="row" flexWrap="wrap">` over per-piece
  // flex children dropped boundary whitespace and shoved punctuation
  // (e.g. ":" after a URL) onto its own visual line because each piece
  // was an atomic flex item.
  //
  // With nested Text, silvery's text pipeline (collectTextWithBg +
  // mergeStyleContext in vendor/silvery render-text.ts) treats the
  // children as virtual text nodes — they contribute to one unified
  // text run for word-wrap, and their styles project onto the cells.
  //
  // <Prose> still wraps the line stack so flexily measures every Text
  // against the parent's available width.
  const lines = text.split("\n")
  let offset = 0
  return (
    <Prose>
      {lines.map((line, lineIdx) => {
        const lineStart = offset
        const lineEnd = offset + line.length
        const lineDetections = detections.filter((d) => d.start >= lineStart && d.end <= lineEnd)
        offset = lineEnd + 1
        if (lineDetections.length === 0) {
          return (
            <Text key={lineIdx} color={tone === "user" ? "$fg" : undefined} wrap="wrap">
              {line}
            </Text>
          )
        }
        const pieces: React.ReactNode[] = []
        let cursor = lineStart
        for (const d of lineDetections) {
          if (d.start > cursor) {
            pieces.push(
              <React.Fragment key={`t${cursor}`}>{line.slice(cursor - lineStart, d.start - lineStart)}</React.Fragment>,
            )
          }
          pieces.push(
            <Text
              key={`d${d.start}`}
              color={colorFor(d)}
              underline
              onClick={() => popover?.show({ body: renderPopoverContent(d) }, { x: 0, y: 0 })}
            >
              {d.match}
            </Text>,
          )
          cursor = d.end
        }
        if (cursor < lineEnd) {
          pieces.push(<React.Fragment key={`tail${cursor}`}>{line.slice(cursor - lineStart)}</React.Fragment>)
        }
        return (
          <Text key={lineIdx} color={tone === "user" ? "$fg" : undefined} wrap="wrap">
            {pieces}
          </Text>
        )
      })}
    </Prose>
  )
}
