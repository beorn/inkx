import React from "react"
import { Box, Prose, Text, usePopover } from "silvery"
import { detectReferences, type Detection } from "../detection.ts"

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
    case "url":
      return (
        <Box flexDirection="column">
          <Text bold>{d.payload.url}</Text>
          <Text>Fetch on-demand: WebFetch resolves on expand.</Text>
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
  }
}

function colorFor(kind: Detection["kind"]): string {
  switch (kind) {
    case "bead":
      return "$accent"
    case "url":
      return "$info"
    case "file":
      return "$primary"
    case "km-node":
      return "$accent"
    case "code-ref":
      return "$primary"
  }
}

export function DetectionText({ text, tone }: { text: string; tone?: "assistant" | "user" }): React.ReactElement {
  const popover = usePopover()
  const detections = detectReferences(text)

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
              color={colorFor(d.kind)}
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
