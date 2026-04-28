/**
 * Regression: long-unbreakable-token overflow in chat content.
 *
 * Bead: km-silvercode.wrap-unbreakable-audit
 *
 * Two related-but-distinct hazards live behind `<Text wrap="wrap">`:
 *
 * 1. Word-wrap of mixed-length text — verified by `wrap-regression.test.tsx`.
 * 2. Long-unbreakable-token overflow — what this file verifies.
 *
 * When the text content contains a SINGLE token longer than the available
 * width (a 200-char URL, a long path, a hex hash), word-wrap has no break
 * opportunity, and the container's intrinsic min-content size becomes the
 * length of that unbreakable token (CSS §4.5 + flexily's recursive
 * `getMinContent`). Without an `overflow:hidden` escape hatch (which forces
 * `auto-min = 0`) somewhere on the path from the root to the Text, the row
 * cannot shrink below the token width — so it bleeds past the parent's
 * width boundary and clips into adjacent UI (like a side panel).
 *
 * Surface under audit: `LinkifiedText` (the chat content renderer). Agents
 * emit URLs into chat output; a long URL is the realistic worst case. If
 * this test passes today, silvery's CSS-preset default (`flexShrink: 1`)
 * plus the `overflow="hidden"` chain in the production layout is enough.
 * If it fails, we either canonicalise the escape hatch in `LinkifiedText`
 * itself, or document that callers MUST wrap it in an `overflow="hidden"`
 * container.
 *
 * Companion: `wrap-regression.test.tsx` covers the multi-word wrap case
 * (mixed-length tokens). Both files use the same 160-col + 40-col side
 * panel `Shell` to keep the bleed-detection convention consistent.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Prose, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { LinkifiedText } from "../src/components/LinkifiedText.tsx"
import { MarkdownView } from "../src/components/MarkdownView.tsx"

const TOTAL_COLS = 160
const SIDE_WIDTH = 40
const LEFT_WIDTH = TOTAL_COLS - SIDE_WIDTH

// 200-char unbreakable URL: realistic worst case for chat content. No
// whitespace and no break opportunities, so word-wrap cannot help. The
// only way this fits is if some ancestor allows main-axis shrink below
// the child's content-min size (overflow:hidden, or explicit
// minWidth=0 + the CSS-preset flexShrink=1).
const LONG_URL = "https://example.com/" + "x".repeat(180) // total length 200, no whitespace, no path delimiters past `/`

const LONG_PATH = "/Users/beorn/Code/pim/km/" + "deeply-nested-segment-".repeat(8) + "end"

function findSide(text: string): number | null {
  for (const line of text.split("\n")) {
    const col = line.indexOf("SIDE_PANEL")
    if (col !== -1) return col
  }
  return null
}

/** Non-whitespace, non-side-panel content at columns >= boundary. */
function contentPastBoundary(text: string, boundary: number): string[] {
  const offenders: string[] = []
  for (const line of text.split("\n")) {
    if (line.length <= boundary) continue
    const right = line.slice(boundary).trim()
    if (right === "" || right.startsWith("SIDE_PANEL")) continue
    offenders.push(line)
  }
  return offenders
}

/**
 * Mirrors the `Shell` from `wrap-regression.test.tsx`: a 160-col root
 * with a left content column (overflow:hidden, paddingX chain) and a
 * 40-col side panel. Width and height are pinned to mimic `<Screen>`'s
 * behaviour in the real app — without that, column→row→wrappable-text
 * chains collapse to height=1.
 */
function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="row" width={TOTAL_COLS} height={30}>
      <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        <Box flexShrink={1} minWidth={0} paddingX={1}>
          <Box flexShrink={1} minWidth={0} paddingX={1}>
            {children}
          </Box>
        </Box>
      </Box>
      <Box flexShrink={0} flexBasis={SIDE_WIDTH} backgroundColor="$mutedbg">
        <Text>SIDE_PANEL</Text>
      </Box>
    </Box>
  )
}

describe("regression: long-unbreakable tokens do not bleed past card boundary", () => {
  test("LinkifiedText with 200-char URL stays inside its card", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <LinkifiedText text={LONG_URL} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    expect(sideCol).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)

    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })

  test("LinkifiedText with long path inside prose stays inside its card", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <LinkifiedText text={`Open the file at ${LONG_PATH} to see the change.`} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })

  test("MarkdownView with 200-char URL stays inside its card", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <MarkdownView source={LONG_URL} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })

  test("plain Text wrap=wrap with 200-char URL stays inside its card", () => {
    // Baseline: a vanilla `<Text wrap="wrap">` consumer. If LinkifiedText
    // fails but this passes, the bug is in LinkifiedText's own shape
    // (the prose-row + nested-text projection). If both fail, the issue
    // is upstream in the ancestor chain we use as Shell.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <Prose>
          <Text wrap="wrap">{LONG_URL}</Text>
        </Prose>
      </Shell>,
    )

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })
})

/**
 * Contract: silvery's CSS-correct defaults handle long-unbreakable tokens
 * end-to-end. Even without explicit `overflow="hidden"` escape hatches in
 * the chain, the row shrinks below the content-min floor.
 *
 * Why this works (silvery CLAUDE.md "CSS-correct defaults"):
 *
 *   silvery now uses CSS-correct flex defaults: `flexShrink: 1`,
 *   `alignContent: stretch`, plus CSS §4.5 flex-item auto min-size with
 *   recursive intrinsic min-content. You don't need to thread
 *   `flexShrink={1} minWidth={0}` through wrap chains — the chain works
 *   without ceremony when the container width exceeds the longest
 *   unbreakable word.
 *
 * The historical hazard (the "thread the cascade or the row balloons"
 * pattern from the Yoga-defaults era) is no longer a hazard for
 * `<Text wrap="wrap">` — the recursive `getMinContent` correctly reports
 * the min-content as the longest unbreakable token, AND the CSS preset
 * lets the parent shrink below that floor when the available width is
 * smaller. (Truncate / clip Text and `wrap=false` content still need
 * `minWidth={0}` per silvery's escape-hatch contract — separate audit.)
 *
 * These contract tests pin the behaviour so a future flip back to
 * Yoga-style defaults would be loud rather than silent.
 */
function MinimalShell({ children }: { children: React.ReactNode }): React.ReactElement {
  // Same shape as Shell, but the inner column omits `overflow="hidden"`.
  // Under historical Yoga defaults this would have leaked content past
  // the boundary; under current CSS defaults the wrap chain handles it.
  return (
    <Box flexDirection="row" width={TOTAL_COLS} height={30}>
      <Box flexDirection="column" flexGrow={1} minHeight={0}>
        <Box paddingX={1}>
          <Box paddingX={1}>{children}</Box>
        </Box>
      </Box>
      <Box flexShrink={0} flexBasis={SIDE_WIDTH} backgroundColor="$mutedbg">
        <Text>SIDE_PANEL</Text>
      </Box>
    </Box>
  )
}

describe("contract: CSS defaults handle long unbreakable tokens without escape hatch", () => {
  test("plain Text wrap=wrap with 200-char URL stays inside its card under MINIMAL shell", () => {
    // No overflow="hidden", no explicit flexShrink/minWidth on the
    // intermediate Boxes. CSS preset (flexShrink:1 default + recursive
    // auto-min-size) is sufficient.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <MinimalShell>
        <Prose>
          <Text wrap="wrap">{LONG_URL}</Text>
        </Prose>
      </MinimalShell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })

  test("LinkifiedText with 200-char URL stays inside its card under MINIMAL shell", () => {
    // Realistic chat surface: LinkifiedText in a card without
    // explicit overflow:hidden. If this ever starts failing, either
    // (a) silvery's CSS defaults flipped back, or (b) flexily's
    // recursive min-content stopped propagating through Prose +
    // nested-Text. Either is a regression worth investigating.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <MinimalShell>
        <LinkifiedText text={LONG_URL} />
      </MinimalShell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])
  })
})
