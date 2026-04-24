import React from "react"
import { Box, Text } from "silvery"
import { diffLines, type Change } from "diff"

/**
 * Single-column diff for the Edit tool's `{old_string, new_string}` payload.
 *
 * Uses Myers/LCS line diff (`diff` package) so unchanged lines become shared
 * context between the two sides, rather than dumping the full old block
 * followed by the full new block.
 *
 * Long runs of unchanged context are elided: when >3 consecutive lines are
 * unchanged, we show the first 2 + a collapsed marker + the last 2 (Claude
 * Code's diff style). Short runs pass through verbatim.
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
  const parts = diffLines(oldText, newText)
  const rows = buildRows(parts)
  // minWidth={0} + overflow="hidden" on the outer container AND each line row
  // so a long code line in the diff (common in real Edit payloads: long string
  // literals, full import paths, URLs) clips at the card's right edge instead
  // of expanding the flex column outward and pushing the side panel off-screen.
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="$border"
      paddingX={1}
      minWidth={0}
      overflow="hidden"
    >
      {filePath && (
        <Text color="$muted" wrap="wrap">
          --- {filePath}
        </Text>
      )}
      {rows.map((row, i) => {
        if (row.kind === "elision") {
          return (
            <Box key={`e${i}`} flexDirection="row" minWidth={0} overflow="hidden">
              <Text color="$muted">{`... ${row.count} lines unchanged ...`}</Text>
            </Box>
          )
        }
        const color = row.kind === "added" ? "$success" : row.kind === "removed" ? "$error" : "$muted"
        const marker = row.kind === "added" ? "+ " : row.kind === "removed" ? "- " : "  "
        return (
          <Box key={`${row.kind[0]}${i}`} flexDirection="row" minWidth={0} overflow="hidden">
            <Text color={color}>{marker}</Text>
            <Text color={color}>{row.line}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

type Row =
  | { kind: "context" | "added" | "removed"; line: string }
  | { kind: "elision"; count: number }

// Minimum unchanged-run length to trigger elision. Stretches of 4+ unchanged
// lines collapse to first-2 + marker + last-2; shorter runs render verbatim.
const ELISION_THRESHOLD = 4
const CONTEXT_LINES = 2

function buildRows(parts: Change[]): Row[] {
  const rows: Row[] = []
  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.added) {
      for (const line of lines) rows.push({ kind: "added", line })
    } else if (part.removed) {
      for (const line of lines) rows.push({ kind: "removed", line })
    } else {
      if (lines.length > ELISION_THRESHOLD) {
        for (let i = 0; i < CONTEXT_LINES; i++) rows.push({ kind: "context", line: lines[i]! })
        rows.push({ kind: "elision", count: lines.length - CONTEXT_LINES * 2 })
        for (let i = lines.length - CONTEXT_LINES; i < lines.length; i++) {
          rows.push({ kind: "context", line: lines[i]! })
        }
      } else {
        for (const line of lines) rows.push({ kind: "context", line })
      }
    }
  }
  return rows
}

// `diffLines` returns each part's `value` with trailing newlines preserved.
// Split on "\n" and drop a trailing empty element so a block ending in "\n"
// doesn't produce a phantom blank line in the output.
function splitLines(value: string): string[] {
  const parts = value.split("\n")
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop()
  return parts
}
