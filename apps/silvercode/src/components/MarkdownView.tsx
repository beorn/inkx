import React, { useMemo } from "react"
import { Box, Blockquote, Divider, H1, H2, H3, H4, Prose, Text } from "silvery"
import { parseBlocks, type MdBlock, type MdInline } from "../markdown.ts"
import { DetectionText } from "./DetectionText.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"

function InlineRun({ tokens }: { tokens: MdInline[] }): React.ReactElement {
  // Render as a SINGLE outer Text containing nested Text spans for
  // bold/italic/code/link. This is the only shape that gives correct
  // word-wrap, contiguous text flow across styles, and bold/italic
  // attributes on cells:
  //
  // - Word-wrap operates over the unified text content, so words flow
  //   naturally across spans (e.g. "github.com/beorn/bearly:" stays
  //   together — the colon doesn't get pushed to a new line).
  // - Whitespace between adjacent spans is preserved verbatim (no flex
  //   gutter eats trailing/leading spaces) — this fixes the "•Content"
  //   bug where the bullet glyph's trailing space disappeared at a flex
  //   item boundary.
  // - Nested <Text bold> / <Text italic> propagate their style to the
  //   merged StyleContext for those characters, so cells carry the bold
  //   / italic attribute (silvery: collectTextWithBg + mergeStyleContext
  //   in render-text.ts).
  //
  // The previous flexWrap="wrap" container with per-token <Text wrap="wrap">
  // children had each token as a separate flex item; flex line wrapping
  // dropped boundary whitespace and broke words across spans.
  return (
    <Text wrap="wrap">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case "bold":
            return (
              <Text key={i} bold>
                {t.text}
              </Text>
            )
          case "italic":
            return (
              <Text key={i} italic>
                {t.text}
              </Text>
            )
          case "code":
            return (
              <Text key={i} color="$accent">
                {t.text}
              </Text>
            )
          case "link":
            return (
              <Text key={i} color="$info" underline>
                {t.text}
              </Text>
            )
          default:
            return <React.Fragment key={i}>{t.text}</React.Fragment>
        }
      })}
    </Text>
  )
}

/**
 * Tight-list-aware spacing: bullet lists pack tight (no gap between
 * items), but lists get a blank line before/after to separate them from
 * surrounding paragraphs. Everything else (paragraph → heading, etc.)
 * also gets a blank line between.
 */
function needsGapBefore(prev: MdBlock | null, curr: MdBlock): boolean {
  if (!prev) return false
  if (curr.kind === "blank" || prev.kind === "blank") return false
  const prevIsList = prev.kind === "bullet" || prev.kind === "ordered"
  const currIsList = curr.kind === "bullet" || curr.kind === "ordered"
  // Consecutive list items of same kind → tight, no gap.
  if (prevIsList && currIsList) return false
  return true
}

function renderBlock(b: MdBlock, i: number): React.ReactElement | null {
  switch (b.kind) {
    case "heading": {
      const Heading = b.level === 1 ? H1 : b.level === 2 ? H2 : b.level === 3 ? H3 : H4
      return <Heading key={i}>{b.text}</Heading>
    }
    case "paragraph": {
      // Use the projected inline tokens from parseBlocks — they preserve
      // bold/italic/code/link spans from the original mdast. Falling back
      // to `parseInline(b.text)` would re-parse the FLATTENED text where
      // `**`/`*` markers have already been stripped by phrasingToString,
      // losing all emphasis. If there's nothing inline-formatted, defer
      // to DetectionText for autodetection (URLs, file paths, beads).
      if (b.inlines.length === 1 && b.inlines[0]?.kind === "text") {
        return <DetectionText key={i} text={b.text} />
      }
      return <InlineRun key={i} tokens={b.inlines} />
    }
    case "bullet":
      return (
        <Box key={i} flexDirection="row" paddingLeft={b.depth * 2}>
          <Text color="$muted">• </Text>
          <Prose flexGrow={1}>
            <InlineRun tokens={b.inlines} />
          </Prose>
        </Box>
      )
    case "ordered":
      return (
        <Box key={i} flexDirection="row" paddingLeft={b.depth * 2}>
          <Text color="$muted">{b.number}. </Text>
          <Prose flexGrow={1}>
            <InlineRun tokens={b.inlines} />
          </Prose>
        </Box>
      )
    case "quote":
      return <Blockquote key={i}>{b.text}</Blockquote>
    case "code":
      return <SyntaxHighlighter key={i} language={b.language || "plain"} code={b.code} />
    case "rule":
      return <Divider key={i} />
    case "blank":
      return null
    case "table":
      return <MarkdownTable key={i} block={b} />
  }
}

export function MarkdownView({ source }: { source: string }): React.ReactElement {
  const blocks = useMemo(() => parseBlocks(source), [source])
  return (
    <Prose>
      {blocks.map((b, i) => {
        const prev = i > 0 ? (blocks[i - 1] ?? null) : null
        const gap = needsGapBefore(prev, b)
        const rendered = renderBlock(b, i)
        if (!rendered) return null
        if (gap) {
          return (
            <React.Fragment key={i}>
              <Box height={1} />
              {rendered}
            </React.Fragment>
          )
        }
        return rendered
      })}
    </Prose>
  )
}

function MarkdownTable({
  block,
}: {
  block: Extract<ReturnType<typeof parseBlocks>[number], { kind: "table" }>
}): React.ReactElement {
  const widths = block.headers.map((h, col) => {
    const maxRow = block.rows.reduce((w, row) => Math.max(w, (row[col] ?? "").length), 0)
    return Math.max(h.length, maxRow)
  })
  const pad = (text: string, col: number) => {
    const align = block.alignments[col]
    const w = widths[col] ?? text.length
    if (align === "right") return text.padStart(w)
    if (align === "center") {
      const extra = w - text.length
      const left = Math.floor(extra / 2)
      return " ".repeat(left) + text + " ".repeat(extra - left)
    }
    return text.padEnd(w)
  }
  // Per-row `overflow="hidden"` so table cells clip rather than wrap —
  // wrapping would destroy the padded column alignment. Card-level
  // clipping at SessionCard handles layout-expansion prevention.
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border" paddingX={1}>
      <Box flexDirection="row" gap={1} overflow="hidden">
        {block.headers.map((h, col) => (
          <Text key={col} bold color="$primary">
            {pad(h, col)}
          </Text>
        ))}
      </Box>
      {block.rows.map((row, rowIdx) => (
        <Box key={rowIdx} flexDirection="row" gap={1} overflow="hidden">
          {row.map((cell, col) => (
            <Text key={col}>{pad(cell, col)}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
