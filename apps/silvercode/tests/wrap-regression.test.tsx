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
 * MISDIAGNOSED-AND-RESOLVED: a previous session ran the App.tsx-mirror
 * scenario without root height pinning and saw text not wrapping. That was
 * filed as a flexily bug (km-silvery.wrap-measurement, P1). Re-investigation
 * (silvery-expert agent verdict, 2026-04-24) found it was a TEST-HARNESS
 * artifact, not a flexily defect:
 *
 * - Real silvercode roots use `<Screen>` which sets explicit
 *   `width={dims.width} height={dims.height}` from the terminal.
 * - `createRenderer({cols, rows})` only passes cols/rows as the available
 *   size to `calculateLayout()` — it does NOT pin root.style.width/height.
 * - Without a definite root height, a column→row→wrappable-text chain
 *   collapses to height=1 via correct CSS max-content sizing (the row's
 *   intrinsic cross size is its tallest child's max-content height, which
 *   for a wrappable Text at unconstrained width is 1).
 * - Pin root via `<Root>` helper (matching `<Screen>`) and the chain wraps
 *   correctly. flexily Phase 7a's NaN×NaN measure is CSS-correct shrink-
 *   wrap behavior — see vendor/flexily/src/layout-zero.ts:947-952.
 *
 * Companion silvery-level test:
 *   vendor/silvery/tests/features/wrap-nested-flexgrow.test.tsx
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

/** Minimal "card + side panel" shell. The outer Box pins `width` and
 *  `height` to mirror what `<Screen>` does in the real app — without that,
 *  column→row→wrappable-text chains collapse to height=1 via correct CSS
 *  max-content sizing and the wrapping that the test wants to verify never
 *  has space to render. */
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

  test("full App-style chain: 5 nested flex-grow boxes wrap at card boundary", () => {
    // Mirrors apps/silvercode/src/App.tsx:397-430 + SessionCard.tsx.
    // The outer Box width/height pin matches what `<Screen>` does in the
    // real app — see vendor/silvery/packages/ag-react/src/ui/components/
    // Screen.tsx:51-58. Without this pin, column→row→wrappable-text chains
    // collapse to height=1 via correct CSS max-content sizing.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 30 })
    const app = render(
      <Box flexDirection="row" width={TOTAL_COLS} height={30}>
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

    const sideCol = findSide(app.text)
    const boundary = sideCol ?? LEFT_WIDTH
    expect(contentPastBoundary(app.text, boundary)).toEqual([])

    const lines = app.text.split("\n")
    expect(lines.some((l) => l.includes("Knowledge Machine"))).toBe(true)
    expect(lines.some((l) => l.includes("unifies notes"))).toBe(true)
    expect(lines.some((l) => l.includes("React TUI"))).toBe(true)
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
