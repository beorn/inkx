import React, { useMemo } from "react"
import { Box, Blockquote, Divider, H1, H2, H3, H4, Link, Prose, Text } from "silvery"
import { parseBlocks, type MdBlock, type MdInline } from "../markdown.ts"
import { LinkifiedText } from "./LinkifiedText.tsx"
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
            // Markdown `[text](href)` → silvery <Link>: emits OSC 8
            // hyperlink so terminal Cmd-click routes to LaunchServices,
            // and silvery's `link:open` event fires for terminals that
            // don't natively consume the click — caught by
            // <SilvercodeLinkOpener> in App.tsx.
            return (
              <Link key={i} href={t.href} color="$info">
                {t.text}
              </Link>
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
      // to LinkifiedText for autodetection (URLs, file paths, beads).
      if (b.inlines.length === 1 && b.inlines[0]?.kind === "text") {
        return <LinkifiedText key={i} text={b.text} />
      }
      return <InlineRun key={i} tokens={b.inlines} />
    }
    case "bullet":
      // `gap={1}` between the glyph and content + `flexShrink={0}` on
      // the glyph keeps a stable space after every bullet — the previous
      // shape (`<Text>• </Text>` with the space INSIDE the text) had the
      // trailing space eaten on bullets 2+ when flex shrunk the glyph
      // cell to its 1-col min-content. Fixed: 2026-04-26.
      return (
        <Box key={i} flexDirection="row" gap={1} paddingLeft={b.depth * 2}>
          <Text color="$muted" flexShrink={0}>
            •
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <InlineRun tokens={b.inlines} />
          </Prose>
        </Box>
      )
    case "ordered":
      return (
        <Box key={i} flexDirection="row" gap={1} paddingLeft={b.depth * 2}>
          <Text color="$muted" flexShrink={0}>
            {b.number}.
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
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
  // Render each row as a SINGLE <Text> with nested colored spans.
  // Earlier shape used a per-row <Box flexDirection="row"> with one Text
  // per cell — silvery's flex defaults pushed each row to ≥2 rows tall in
  // some contexts, producing a sparse, broken-looking table. Nested Text
  // is the canonical silvery pattern for inline mixed-style content (see
  // LinkifiedText) and renders at exactly content height.
  //
  // Cells clip via padEnd width — wrap would destroy column alignment.
  const sep = " │ "
  const ruleSegments = widths.map((w) => "─".repeat(w))
  const headerRule = ruleSegments.join("─┼─")
  // Body row divider — only on small tables where it adds clarity.
  // For dense tables (5+ rows), the dividers turn into visual noise.
  // Header rule is always present.
  const showRowDividers = block.rows.length > 0 && block.rows.length < 5
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="$border">
      <Text>
        {block.headers.map((h, col) => (
          <React.Fragment key={col}>
            {col > 0 && <Text color="$border">{sep}</Text>}
            <Text bold color="$primary">
              {pad(h, col)}
            </Text>
          </React.Fragment>
        ))}
      </Text>
      <Text color="$border">{headerRule}</Text>
      {block.rows.map((row, rowIdx) => (
        <React.Fragment key={rowIdx}>
          {showRowDividers && rowIdx > 0 && <Text color="$muted">{headerRule}</Text>}
          <Text>
            {row.map((cell, col) => (
              <React.Fragment key={col}>
                {col > 0 && <Text color="$border">{sep}</Text>}
                {pad(cell, col)}
              </React.Fragment>
            ))}
          </Text>
        </React.Fragment>
      ))}
    </Box>
  )
}
