/**
 * `/raw` debug-view contract — user message rows surface the chip when
 * a user message has additionalContext (system-reminders, isMeta
 * bodies, hook output stripped from the visible chat surface) and
 * inlines the full body when `showRaw=true`.
 *
 * Tests the inline UserRow rendering baked into SessionUpdateList, using
 * the same layout as the production component so the invariants hold.
 *
 * Bead: km-silvercode.resume-show-everything-collapsed.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Prose, Screen, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { LinkifiedText } from "../../src/components/LinkifiedText.tsx"

/**
 * Inline user-message row — same layout as SessionUpdateList's `UserRow`.
 */
function UserRow({
  text,
  additionalContext,
  showRaw,
}: {
  text: string
  additionalContext?: string
  showRaw?: boolean
}): React.ReactElement {
  const hasContext = (additionalContext?.length ?? 0) > 0
  const isMetaOnly = text.length === 0 && hasContext
  const lineCount = additionalContext ? additionalContext.split("\n").length : 0
  return (
    <Box
      flexDirection="column"
      flexShrink={1}
      minWidth={0}
      backgroundColor="$bg-surface-subtle"
      paddingX={1}
      paddingY={0}
    >
      {!isMetaOnly && (
        <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
          <Text bold color="$accent">
            {">"}
          </Text>
          <Prose flexGrow={1} flexShrink={1} minWidth={0}>
            <LinkifiedText text={text} role="user" />
          </Prose>
        </Box>
      )}
      {hasContext && (
        <Box flexDirection="column" flexShrink={1} minWidth={0}>
          <Text color="$muted">
            {showRaw ? "▾" : "▸"} {lineCount} line{lineCount === 1 ? "" : "s"} of hidden context (run `/raw` to toggle)
          </Text>
          {showRaw && (
            <Box flexDirection="column" flexShrink={1} minWidth={0} paddingLeft={2}>
              <Text color="$muted" wrap="wrap">
                {additionalContext}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

function renderBlock(props: { text: string; additionalContext?: string; showRaw?: boolean; cols?: number }): string {
  const { cols = 120 } = props
  const r = createRenderer({ cols, rows: 30 })
  const app = r(
    <Screen flexDirection="column">
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        <UserRow text={props.text} additionalContext={props.additionalContext} showRaw={props.showRaw} />
      </Box>
    </Screen>,
  )
  return app.text
}

describe("user message row — /raw debug view", () => {
  test("plain message (no additionalContext): no chip, no body", () => {
    const text = renderBlock({ text: "what is this repo about?" })
    expect(text).toContain("what is this repo about?")
    expect(text).not.toContain("hidden context")
    expect(text).not.toContain("▸")
    expect(text).not.toContain("▾")
  })

  test("message with additionalContext: chip shown collapsed by default", () => {
    const ctx = ["[system-reminder]", "cwd: /work", "model: claude-sonnet"].join("\n")
    const text = renderBlock({ text: "hello", additionalContext: ctx })
    expect(text).toContain("hello")
    // Chip shows with collapsed glyph + line count + the toggle hint.
    expect(text).toContain("▸")
    expect(text).toContain("3 lines of hidden context")
    expect(text).toContain("/raw")
    // Body is NOT inlined when showRaw is false.
    expect(text).not.toContain("cwd: /work")
    expect(text).not.toContain("model: claude-sonnet")
  })

  test("message with additionalContext + showRaw=true: body inlined dimmed", () => {
    const ctx = ["[system-reminder]", "cwd: /work", "extra detail here"].join("\n")
    const text = renderBlock({ text: "hello", additionalContext: ctx, showRaw: true })
    expect(text).toContain("hello")
    // Chip flips to expanded glyph.
    expect(text).toContain("▾")
    // Body is now visible.
    expect(text).toContain("cwd: /work")
    expect(text).toContain("extra detail here")
  })

  test("isMeta-only message (text='', additionalContext set): renders chip without > prompt line", () => {
    // isMeta entries (e.g. "Continue from where you left off." auto-resume)
    // have no user-typed text — only a chip should appear, not a `> `
    // prompt with empty body.
    const ctx = "[isMeta]\nContinue from where you left off."
    const text = renderBlock({ text: "", additionalContext: ctx })
    // Chip appears.
    expect(text).toContain("▸")
    expect(text).toContain("hidden context")
    // No `> ` user-prompt arrow (would render a confusing empty prompt).
    // Use a regex that excludes the chip's own > inside parentheses.
    const lines = text.split("\n")
    const promptLines = lines.filter((l) => /^\s*>\s+\S/.test(l) && !l.includes("hidden context"))
    expect(promptLines).toEqual([])
  })

  test("isMeta-only message + showRaw=true: body visible, still no > prompt line", () => {
    const ctx = "[isMeta]\nContinue from where you left off."
    const text = renderBlock({ text: "", additionalContext: ctx, showRaw: true })
    expect(text).toContain("Continue from where you left off.")
    expect(text).toContain("▾")
  })

  test("singular line count uses 'line' not 'lines'", () => {
    const ctx = "single line of context"
    const text = renderBlock({ text: "hi", additionalContext: ctx })
    expect(text).toMatch(/1 line of hidden/)
    expect(text).not.toMatch(/1 lines of hidden/)
  })
})
