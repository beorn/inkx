import React, { useMemo } from "react"
import { Box, Blockquote, H1, H2, H3, H4, Muted, Text } from "silvery"
import { parseBlocks, parseInline, type MdInline } from "../markdown.ts"
import { DetectionText } from "./DetectionText.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"

function InlineRun({ tokens }: { tokens: MdInline[] }): React.ReactElement {
  return (
    <Box flexDirection="row" flexWrap="wrap">
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
            // Inline code as a coloured foreground keyword, not a background
            // pill — Claude Code's style. Keeps the line dense without the
            // visual weight of a filled box.
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
            return <Text key={i}>{t.text}</Text>
        }
      })}
    </Box>
  )
}

export function MarkdownView({ source }: { source: string }): React.ReactElement {
  const blocks = useMemo(() => parseBlocks(source), [source])
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
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
                <InlineRun tokens={parseInline(b.text)} />
              </Box>
            )
          case "ordered":
            return (
              <Box key={i} flexDirection="row" paddingLeft={b.depth * 2}>
                <Text color="$muted">{b.number}. </Text>
                <InlineRun tokens={parseInline(b.text)} />
              </Box>
            )
          case "quote":
            return <Blockquote key={i}>{b.text}</Blockquote>
          case "code":
            return <SyntaxHighlighter key={i} language={b.language || "plain"} code={b.code} />
          case "rule":
            return <Muted key={i}>{"─".repeat(40)}</Muted>
          case "blank":
            return null
          case "table":
            return <MarkdownTable key={i} block={b} />
        }
      })}
    </Box>
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
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {block.headers.map((h, col) => (
          <Text key={col} bold color="$primary">
            {pad(h, col)}
          </Text>
        ))}
      </Box>
      {block.rows.map((row, rowIdx) => (
        <Box key={rowIdx} flexDirection="row" gap={1}>
          {row.map((cell, col) => (
            <Text key={col}>{pad(cell, col)}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
