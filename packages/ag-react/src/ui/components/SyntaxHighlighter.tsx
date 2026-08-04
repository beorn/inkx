import { useEffect, useState } from "react"
import type { ReactElement } from "react"
import { highlight, type TokenLine } from "@silvery/syntax"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { useHover } from "../../hooks/useHover"

export interface SyntaxHighlighterProps {
  language: string
  code: string
  theme?: string
  bare?: boolean
  backgroundColor?: string
  bold?: boolean
  /** Reports each semantic source line at its measured visual y origin. */
  onLineLayout?: (lineIndex: number, y: number) => void
}

function useSyntaxTokens(code: string, language: string, theme: string): TokenLine[] {
  const [lines, setLines] = useState<TokenLine[]>(() =>
    code.split("\n").map((text) => ({ tokens: [{ text }] })),
  )

  useEffect(() => {
    let cancelled = false
    void highlight(code, language, theme).then((result) => (cancelled ? undefined : setLines(result)))
    return () => {
      cancelled = true
    }
  }, [code, language, theme])

  return lines
}

function isDiffLanguage(language: string): boolean {
  return ["diff", "patch", "udiff", "gitdiff", "git-diff"].includes(language)
}

/** Shiki-backed source renderer with an immediate plain-text first frame. */
export function SyntaxHighlighter({
  language,
  code,
  theme = "github-dark",
  bare = false,
  backgroundColor,
  bold: forceBold = false,
  onLineLayout,
}: SyntaxHighlighterProps): ReactElement {
  const lang = (language || "plain").toLowerCase()
  const hover = useHover()
  const lines = useSyntaxTokens(code, lang, theme)
  const lineWrap = isDiffLanguage(lang) ? "truncate" : "hard"
  const body = lines.map((line, lineIndex) => (
    <Box
      key={lineIndex}
      minWidth={0}
      flexDirection="row"
      onLayout={onLineLayout ? (rect) => onLineLayout(lineIndex, rect.y) : undefined}
    >
      <Text wrap={lineWrap} backgroundColor={backgroundColor}>
        {line.tokens.map((token, tokenIndex) => (
          <Text
            key={tokenIndex}
            color={token.color}
            bold={forceBold || token.bold}
            italic={token.italic}
            backgroundColor={backgroundColor}
          >
            {token.text}
          </Text>
        ))}
      </Text>
    </Box>
  ))

  if (bare) return <Box flexDirection="column">{body}</Box>

  return (
    <Box
      flexDirection="column"
      position="relative"
      minWidth={0}
      backgroundColor="$bg-surface-subtle"
      paddingX={2}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <Text> </Text>
      {hover.isHovered ? (
        <Box
          position="absolute"
          top={1}
          right={1}
          flexDirection="row"
          backgroundColor="$bg-surface-subtle"
        >
          <Text backgroundColor="$bg-surface-subtle"> </Text>
          <Text color="$fg-muted" backgroundColor="$bg-surface-subtle">
            {lang}
          </Text>
          <Text backgroundColor="$bg-surface-subtle"> </Text>
        </Box>
      ) : null}
      {body}
      <Text> </Text>
    </Box>
  )
}
