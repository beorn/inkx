import React, { useMemo } from "react"
import { Box, Blockquote, Divider, H1, H2, H3, H4, Prose, Text } from "silvery"
import { parseBlocks, parseInline, type MdBlock, type MdInline } from "../markdown.ts"
import { DetectionText } from "./DetectionText.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"

function InlineRun({ tokens }: { tokens: MdInline[] }): React.ReactElement {
  // flexWrap="wrap" + per-Text wrap="wrap" so inline runs reflow nicely
  // over multiple visual lines. Card-level overflow=hidden at SessionCard
  // prevents truly unwrappable tokens from expanding the card; this wrap
  // is purely for readability of paragraph-shaped text.
  return (
    <Box flexDirection="row" flexWrap="wrap" minWidth={0}>
      {tokens.map((t, i) => {
        switch (t.kind) {
          case "bold":
            return (
              <Text key={i} bold wrap="wrap">
                {t.text}
              </Text>
            )
          case "italic":
            return (
              <Text key={i} italic wrap="wrap">
                {t.text}
              </Text>
            )
          case "code":
            return (
              <Text key={i} color="$accent" wrap="wrap">
                {t.text}
              </Text>
            )
          case "link":
            return (
              <Text key={i} color="$info" underline wrap="wrap">
                {t.text}
              </Text>
            )
          default:
            return (
              <Text key={i} wrap="wrap">
                {t.text}
              </Text>
            )
        }
      })}
    </Box>
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
      const inline = parseInline(b.text)
      // If paragraph has nothing inline-formatted, keep detection highlighting.
      if (inline.length === 1 && inline[0]!.kind === "text") {
        return <DetectionText key={i} text={b.text} />
      }
      return <InlineRun key={i} tokens={inline} />
    }
    case "bullet":
      return (
        <Box key={i} flexDirection="row" paddingLeft={b.depth * 2}>
          <Text color="$muted">• </Text>
          <Prose flexGrow={1}>
            <InlineRun tokens={parseInline(b.text)} />
          </Prose>
        </Box>
      )
    case "ordered":
      return (
        <Box key={i} flexDirection="row" paddingLeft={b.depth * 2}>
          <Text color="$muted">{b.number}. </Text>
          <Prose flexGrow={1}>
            <InlineRun tokens={parseInline(b.text)} />
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
