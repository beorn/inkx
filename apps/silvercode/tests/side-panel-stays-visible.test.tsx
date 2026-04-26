/**
 * Regression: side panel must remain visible when the card body contains
 * a long unwrappable token (paths, URLs, JSON strings, code).
 *
 * This is the load-bearing test for the "overflow at root" pattern —
 * if the outer left column doesn't clip, any wide descendant expands
 * the column and pushes the side panel off-screen.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"

const BLOB_600 = "x".repeat(600)
const TOTAL_COLS = 120
const SIDE_WIDTH = 40
const LEFT_WIDTH = TOTAL_COLS - SIDE_WIDTH // 80

/**
 * Minimal repro of the silvercode layout shape:
 *
 *   <Screen row>
 *     <Box column flexGrow=1 overflow="hidden">   # the bounded-region boundary
 *       ...wide descendants...
 *     </Box>
 *     <Box flexShrink=0 flexBasis=40>SIDE</Box>
 *   </Screen>
 *
 * `overflow="hidden"` on the outer left column is the single point that
 * keeps the side panel visible — CSS spec §4.5 makes this Box shrinkable
 * against its flex parent, and silvery's render phase clips the content
 * that would otherwise extend past its bounds.
 */
function TestLayout({
  protection,
  children,
}: {
  protection: "none" | "minWidth" | "overflow-hidden"
  children: React.ReactNode
}): React.ReactElement {
  const leftProps =
    protection === "minWidth"
      ? { minWidth: 0 as const }
      : protection === "overflow-hidden"
        ? { overflow: "hidden" as const }
        : {}
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexGrow={1} {...leftProps}>
        {children}
      </Box>
      <Box flexShrink={0} flexBasis={SIDE_WIDTH} backgroundColor="$mutedbg">
        <Text>SIDE_PANEL</Text>
      </Box>
    </Box>
  )
}

function findSide(text: string): number | null {
  const lines = text.split("\n")
  for (const line of lines) {
    const col = line.indexOf("SIDE_PANEL")
    if (col !== -1) return col
  }
  return null
}

describe("side panel stays visible with wide descendants", () => {
  test("overflow=hidden at outer left column clips a 600-char blob", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 20 })
    const app = render(
      <TestLayout protection="overflow-hidden">
        <Text wrap="wrap">{BLOB_600}</Text>
      </TestLayout>,
    )
    const col = findSide(app.text)
    expect(col).not.toBeNull()
    expect(col).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)
  })

  test("overflow=hidden works through deeply nested columns", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 20 })
    const app = render(
      <TestLayout protection="overflow-hidden">
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" gap={1}>
              <Text>→</Text>
              <Box flexDirection="column" flexGrow={1}>
                <Text wrap="wrap">{BLOB_600}</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </TestLayout>,
    )
    const col = findSide(app.text)
    expect(col).not.toBeNull()
    expect(col).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)
  })

  test("minWidth=0 alone is sufficient under silvery's CSS-correct flex defaults", () => {
    // After silvery flipped to CSS-correct flex defaults (flexShrink: 1
    // by default + CSS §4.5 auto min-size), `minWidth: 0` on the wide
    // descendant is sufficient by itself: the left column shrinks against
    // its flex parent, and the side panel stays visible without an
    // explicit `overflow="hidden"` clip. Documenting this so the inverse
    // assumption (which held under the historical Yoga-flavored defaults)
    // doesn't creep back into other tests.
    const render = createRenderer({ cols: TOTAL_COLS, rows: 20 })
    const app = render(
      <TestLayout protection="minWidth">
        <Text wrap="wrap">{BLOB_600}</Text>
      </TestLayout>,
    )
    const col = findSide(app.text)
    expect(col).not.toBeNull()
    expect(col).toBeGreaterThanOrEqual(LEFT_WIDTH - 2)
  })
})
