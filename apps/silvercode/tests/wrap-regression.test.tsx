/**
 * Regression: markdown paragraph text in AssistantBlock must WRAP at the
 * card boundary, not render as a single long line.
 *
 * Screenshot 2026-04-24 14.18.36: "This is km (Knowledge Machine) at
 * ~/Code/pim/km — a TypeScript/Bun TUI workspace for agen" clipped at
 * "agen" by the side panel. Text should wrap onto additional lines.
 *
 * Two separate fixes went into this regression:
 *
 *   1. `DetectionText` (src/components/DetectionText.tsx) emits a flex-row
 *      wrapping N Text pieces (plain-text gaps + detection links). Without
 *      `flexShrink=1 minWidth=0` on that row (and its outer column),
 *      flexily measures the row at `sum(children.maxContent)` ≫ parent
 *      width; per-Text `wrap="wrap"` then receives the row's wide measure
 *      and never wraps.
 *
 *   2. `AssistantBlock` (src/components/AssistantBlock.tsx) outer
 *      `<Box flexDirection="row" paddingX={1}>` was missing the same
 *      props; even after DetectionText wraps correctly, the AssistantBlock
 *      row expands to child-intrinsic width and defeats wrap.
 *
 * silvery's reconciler does NOT apply CSS §4.5's "overflow:hidden ⇒
 * flex-shrink:1" rule, and flexily defaults shrink to 0 when unset, so
 * `flexShrink={1} minWidth={0}` must be explicit at every intermediate
 * Box that sits between a bounded parent and the text that should wrap.
 *
 * KNOWN residual: in the FULL App.tsx chain (Screen row → left column →
 * per-session wrapper flexGrow=1 → SessionCard outer flexGrow=1 →
 * SessionCard inner flexGrow=1 → AssistantBlock → MarkdownView), stacking
 * 3+ levels of `flexGrow=1` on flex-columns still triggers a flexily bug
 * where `<Text wrap="wrap">` descendants receive their max-content width
 * instead of the parent's available width. See the "G" / "H" debug cases
 * during the session that diagnosed this. Fixing that requires a flexily
 * layout-phase change (bench + fuzz verified). This test covers the
 * component-level fixes.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"
import { AssistantBlock } from "../src/components/AssistantBlock.tsx"
import { DetectionText } from "../src/components/DetectionText.tsx"
import { MarkdownView } from "../src/components/MarkdownView.tsx"

const TOTAL_COLS = 160
const SIDE_WIDTH = 40
const LEFT_WIDTH = TOTAL_COLS - SIDE_WIDTH

const SCREENSHOT_TEXT =
  "This is km (Knowledge Machine) at ~/Code/pim/km — a TypeScript/Bun TUI workspace for agentic knowledge workers. It unifies notes, tasks, and calendar data with full history and bidirectional markdown sync, using TypeScript, Bun, SQLite, and Silvery for the React TUI."

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

/** Minimal "card + side panel" shell that doesn't trigger the flexily
 *  nested-flexGrow bug — ONE flexGrow level, then flexShrink-only layers. */
function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="row">
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

describe("regression: DetectionText wraps mixed-token paragraphs at card boundary", () => {
  test("DetectionText with 5-piece shape wraps onto multiple visual lines", () => {
    // The screenshot text produces 2 detections: `~/Code/pim/km` and
    // `/Bun` (from "TypeScript/Bun"). That's 5 Text pieces in the row.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <DetectionText text={SCREENSHOT_TEXT} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()
    expect(sideCol).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)

    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    // Sentinels from different parts of the paragraph end up on
    // different wrapped lines when wrap works.
    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })

  test("AssistantBlock + MarkdownView wraps at card boundary", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <AssistantBlock text={SCREENSHOT_TEXT} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()

    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })

  test("full App-style chain: identifies remaining flexily bug", () => {
    // This mirrors apps/silvercode/src/App.tsx:317-340 + SessionCard.tsx.
    // It documents the CURRENT behavior — when this test starts passing,
    // the nested-flexGrow flexily bug has been fixed.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <Box flexDirection="row" flexWrap="wrap" flexGrow={1} flexShrink={1} minHeight={0}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              {/* SessionCard outer */}
              <Box
                flexDirection="column"
                flexGrow={1}
                flexShrink={1}
                minWidth={0}
                minHeight={0}
                overflow="hidden"
                paddingX={1}
              >
                {/* SessionCard inner */}
                <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
                  <AssistantBlock text={SCREENSHOT_TEXT} />
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
        <Box flexShrink={0} flexBasis={SIDE_WIDTH} backgroundColor="$mutedbg">
          <Text>SIDE_PANEL</Text>
        </Box>
      </Box>,
    )
    const lines = app.text.split("\n")
    // Document current broken behavior: only first sentence renders on
    // row 0, rest of paragraph is clipped. When the underlying flexily
    // bug is fixed, this test should be updated to assert correct wrap
    // (replace .toBe(false) with .toBe(true) and invert the offenders
    // check).
    const hasMiddle = lines.some((l) => l.includes("unifies notes"))
    expect(hasMiddle).toBe(false) // TODO: invert once flexily bug fixed
  })

  test("plain MarkdownView wraps at card boundary", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Shell>
        <MarkdownView source={SCREENSHOT_TEXT} />
      </Shell>,
    )

    const sideCol = findSide(app.text)
    expect(sideCol).not.toBeNull()

    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
  })
})
