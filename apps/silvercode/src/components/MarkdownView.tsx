import React, { useMemo } from "react"
import { Box, Blockquote, Divider, H1, H2, H3, H4, Link, Prose, Text } from "silvery"
import { parseBlocks, type MdBlock, type MdInline } from "../markdown.ts"
import { LinkifiedText } from "./LinkifiedText.tsx"
import { SyntaxHighlighter } from "./SyntaxHighlighter.tsx"
import { Content, useHasContentLayout } from "./Content.tsx"

function InlineRun({
  tokens,
  role,
  backgroundColor,
}: {
  tokens: MdInline[]
  role?: "assistant" | "user"
  backgroundColor?: string
}): React.ReactElement {
  const wrapMode = role === "user" ? "even" : "wrap"
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
    <Text color={role === "user" ? "$fg" : undefined} backgroundColor={backgroundColor} wrap={wrapMode}>
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

function renderBlock(
  b: MdBlock,
  i: number,
  role?: "assistant" | "user",
  hasContentLayout = false,
  backgroundColor?: string,
  textIndent = 0,
): React.ReactElement | null {
  const inset = (child: React.ReactElement) =>
    textIndent > 0 ? (
      <Box key={i} flexDirection="row" minWidth={0} flexShrink={1}>
        <Box width={textIndent} flexShrink={0} />
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          {child}
        </Box>
      </Box>
    ) : (
      child
    )
  const prose = (child: React.ReactElement) =>
    role === "user" || !hasContentLayout ? child : <Content.Prose key={i}>{child}</Content.Prose>
  switch (b.kind) {
    case "heading": {
      const Heading = b.level === 1 ? H1 : b.level === 2 ? H2 : b.level === 3 ? H3 : H4
      return prose(inset(<Heading key={i}>{b.text}</Heading>))
    }
    case "paragraph": {
      // Use the projected inline tokens from parseBlocks — they preserve
      // bold/italic/code/link spans from the original mdast. Falling back
      // to `parseInline(b.text)` would re-parse the FLATTENED text where
      // `**`/`*` markers have already been stripped by phrasingToString,
      // losing all emphasis. If there's nothing inline-formatted, defer
      // to LinkifiedText for autodetection (URLs, file paths, beads).
      if (b.inlines.length === 1 && b.inlines[0]?.kind === "text") {
        return prose(inset(<LinkifiedText key={i} text={b.text} role={role} backgroundColor={backgroundColor} />))
      }
      return prose(inset(<InlineRun key={i} tokens={b.inlines} role={role} backgroundColor={backgroundColor} />))
    }
    case "bullet":
      // `gap={1}` between the glyph and content + `flexShrink={0}` on
      // the glyph keeps a stable space after every bullet — the previous
      // shape (`<Text>• </Text>` with the space INSIDE the text) had the
      // trailing space eaten on bullets 2+ when flex shrunk the glyph
      // cell to its 1-col min-content. Fixed: 2026-04-26.
      return prose(inset(
        <Box key={i} flexDirection="row" gap={1} paddingLeft={b.depth * 2} flexShrink={0}>
          <Text color="$muted" backgroundColor={backgroundColor} flexShrink={0}>
            {role === "user" ? "•" : "·"}
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <InlineRun tokens={b.inlines} role={role} backgroundColor={backgroundColor} />
          </Prose>
        </Box>,
      ))
    case "ordered":
      return prose(inset(
        <Box key={i} flexDirection="row" gap={1} paddingLeft={b.depth * 2} flexShrink={0}>
          <Text color="$muted" backgroundColor={backgroundColor} flexShrink={0}>
            {b.number}.
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <InlineRun tokens={b.inlines} role={role} backgroundColor={backgroundColor} />
          </Prose>
        </Box>,
      ))
    case "quote":
      return prose(inset(<Blockquote key={i}>{b.text}</Blockquote>))
    case "code":
      {
        const language = b.language || "plain"
        return prose(<SyntaxHighlighter key={i} language={language} code={b.code} />)
      }
    case "rule":
      return <Divider key={i} />
    case "blank":
      return null
    case "table":
      if (!hasContentLayout) {
        return <InlineTableCards key={i} headers={b.headers} rows={b.rows} />
      }
      return <Content.Table key={i} headers={b.headers} rows={b.rows} alignments={b.alignments} />
  }
}

function InlineTableCards({
  headers,
  rows,
}: {
  headers: readonly string[]
  rows: readonly (readonly string[])[]
}): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1} borderStyle="single" borderColor="$border" paddingX={1}>
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx} flexDirection="column" minWidth={0}>
          {headers.map((header, col) => (
            <Text key={col} wrap="wrap">
              <Text bold color="$primary">
                {header}:
              </Text>{" "}
              {row[col] ?? ""}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export function MarkdownView({
  source,
  role,
  backgroundColor,
  layout = "content",
  textIndent = 0,
}: {
  source: string
  role?: "assistant" | "user"
  backgroundColor?: string
  layout?: "content" | "inline"
  textIndent?: number
}): React.ReactElement {
  const hasContentLayout = useHasContentLayout()
  return (
    <MarkdownViewBody
      source={source}
      role={role}
      backgroundColor={backgroundColor}
      hasContentLayout={hasContentLayout}
      layout={layout}
      textIndent={textIndent}
    />
  )
}

function MarkdownViewBody({
  source,
  role,
  backgroundColor,
  hasContentLayout,
  layout,
  textIndent,
}: {
  source: string
  role?: "assistant" | "user"
  backgroundColor?: string
  hasContentLayout: boolean
  layout: "content" | "inline"
  textIndent: number
}): React.ReactElement {
  const blocks = useMemo(() => parseBlocks(source), [source])
  return (
    <Prose flexShrink={1} minWidth={0}>
      {blocks.map((b, i) => {
        const prev = i > 0 ? (blocks[i - 1] ?? null) : null
        const gap = needsGapBefore(prev, b)
        const rendered = renderBlock(b, i, role, layout === "content" && hasContentLayout, backgroundColor, textIndent)
        if (!rendered) return null
        if (gap) {
          return (
            <React.Fragment key={i}>
              <Box height={1} flexShrink={0} />
              {rendered}
            </React.Fragment>
          )
        }
        return rendered
      })}
    </Prose>
  )
}
