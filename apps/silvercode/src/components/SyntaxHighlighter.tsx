import React, { useState, useEffect } from "react"
import { Box, Text } from "silvery"
import { highlight, type TokenLine } from "@silvery/syntax"

/**
 * SyntaxHighlighter — shiki-backed code renderer.
 *
 * Loads a shiki grammar for `language` on first render (lazy, cached by
 * `@silvery/syntax`). While the grammar is loading a plain-text fallback is
 * shown so the component never blocks. Once loaded the component upgrades to
 * full syntax-highlighted output without remounting.
 *
 * Color output: shiki emits 24-bit hex colors per token. Silvery's `<Text
 * color>` prop accepts hex strings directly, so no palette mapping is needed —
 * each token is rendered with its theme-assigned color.
 *
 * Theme: defaults to `"github-dark"` (bundled with shiki). Override via the
 * `theme` prop with any shiki `BundledTheme` ID.
 *
 * @example
 * ```tsx
 * <SyntaxHighlighter language="typescript" code="const x = 1" />
 * <SyntaxHighlighter language="python" code="def hello(): pass" theme="nord" />
 * ```
 */

/** Shiki BundledTheme string type (not imported to avoid hard dep on shiki types at call site). */
type ShikiTheme = string

export interface SyntaxHighlighterProps {
  /** Language alias (e.g. "ts", "py", "rs") or full shiki language ID. */
  language: string
  /** Source code to display. */
  code: string
  /** Shiki theme ID. Defaults to "github-dark". */
  theme?: ShikiTheme
}

// =============================================================================
// useSyntaxTokens — async highlight hook with plain-text fallback
// =============================================================================

function useSyntaxTokens(code: string, language: string, theme: string): TokenLine[] {
  // Seed the state with synchronous plain-text lines so the first render is
  // non-empty (no height flash). highlight() will upgrade them once resolved.
  const [lines, setLines] = useState<TokenLine[]>(() => code.split("\n").map((text) => ({ tokens: [{ text }] })))

  useEffect(() => {
    let cancelled = false

    void highlight(code, language, theme).then((result) => {
      if (!cancelled) setLines(result)
      return undefined
    })

    return () => {
      cancelled = true
    }
  }, [code, language, theme])

  return lines
}

// =============================================================================
// Component
// =============================================================================

export function SyntaxHighlighter({
  language,
  code,
  theme = "github-dark",
}: SyntaxHighlighterProps): React.ReactElement {
  const lang = (language || "plain").toLowerCase()
  const lines = useSyntaxTokens(code, lang, theme)

  return (
    <Box flexDirection="column" paddingX={1} backgroundColor="$surfacebg" borderStyle="single" borderColor="$border">
      <Box flexDirection="row">
        <Text color="$muted">{lang}</Text>
      </Box>
      {lines.map((line, i) => (
        // Per-row overflow="hidden" so a long code line clips rather than
        // wraps — wrapping would destroy source-code visual alignment.
        <Box key={i} flexDirection="row" overflow="hidden">
          {line.tokens.map((tok, j) => (
            <Text key={j} color={tok.color} bold={tok.bold} italic={tok.italic}>
              {tok.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
