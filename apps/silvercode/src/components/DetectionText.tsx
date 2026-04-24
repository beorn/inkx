import React from "react"
import { Box, Text, usePopover } from "silvery"
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

  // Split by line first so layout stays inline per-line; inside each line
  // split by detection spans.
  const lines = text.split("\n")
  let offset = 0
  return (
    <Box flexDirection="column">
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
              <Text key={`t${cursor}`} wrap="wrap">
                {line.slice(cursor - lineStart, d.start - lineStart)}
              </Text>,
            )
          }
          pieces.push(
            <Text
              key={`d${d.start}`}
              color={colorFor(d.kind)}
              underline
              wrap="wrap"
              onClick={() => popover?.show({ body: renderPopoverContent(d) }, { x: 0, y: 0 })}
            >
              {d.match}
            </Text>,
          )
          cursor = d.end
        }
        if (cursor < lineEnd)
          pieces.push(
            <Text key={`tail${cursor}`} wrap="wrap">
              {line.slice(cursor - lineStart)}
            </Text>,
          )
        // flexWrap="wrap" — lets mixed-token inline runs reflow onto
        // multiple visual lines when the row exceeds the card width.
        // (Card-level clipping at SessionCard's overflow=hidden prevents
        // outright layout expansion; this wrap is for readability.)
        return (
          <Box key={lineIdx} flexDirection="row" flexWrap="wrap">
            {pieces}
          </Box>
        )
      })}
    </Box>
  )
}
