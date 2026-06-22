/**
 * Regression: a VERTICAL `│` PaneDivider nested inside the TOP region of a
 * COLUMN split must NOT bleed one row down into the bottom pane.
 *
 * Production trigger (ag/code PaneGrid, hab deck 3-pane layout):
 *   COLUMN split  = top region + bottom pane, separated by a horizontal `─`.
 *   top region    = ROW split (left | right), separated by a vertical `│`.
 *
 * The vertical `│` lives inside the top region. Its height must equal the
 * top region's content height. The bug: the `│` painted one row PAST the
 * top region — landing in the bottom pane's first row, ~1 col left of the
 * column boundary. It reproduces deterministically (no incremental-vs-fresh
 * mismatch), so it is a LAYOUT EXTENT issue: the vertical divider's box is
 * one cell taller than its split region, OR a flexBasis-percentage rounding
 * makes the top region one cell too tall.
 *
 * This test uses the PRODUCTION PaneDivider shape (via the real component)
 * and percentage flexBasis like PaneGrid's `${weight*100}%`.
 *
 * Bead: @hab/19797-hab-master/20310 (section C — C1 divider bleed).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, PaneDivider, Text } from "silvery"

const COLS = 80
const ROWS = 24

function Pane({ label }: { label: string }): React.ReactElement {
  return (
    <Box flexGrow={1} minWidth={0} minHeight={0} flexDirection="column">
      <Text>{label}</Text>
    </Box>
  )
}

/** Mirror PaneGrid.SplitRenderer: two flexBasis-% children + a divider. */
function Split({
  direction,
  weight,
  first,
  second,
}: {
  direction: "row" | "column"
  weight: number
  first: React.ReactNode
  second: React.ReactNode
}): React.ReactElement {
  const firstBasis = `${weight * 100}%`
  const secondBasis = `${(1 - weight) * 100}%`
  return (
    <Box flexDirection={direction} flexGrow={1} minHeight={0} minWidth={0}>
      <Box flexDirection="column" flexGrow={0} flexBasis={firstBasis} minHeight={0} minWidth={0}>
        {first}
      </Box>
      <PaneDivider
        orientation={direction === "row" ? "vertical" : "horizontal"}
        size={1}
        color="$border"
      />
      <Box flexDirection="column" flexGrow={0} flexBasis={secondBasis} minHeight={0} minWidth={0}>
        {second}
      </Box>
    </Box>
  )
}

/** 3-pane deck: column split, whose top child is a row split. */
function Deck3Pane({ weight }: { weight: number }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="row" flexGrow={1} minHeight={0} minWidth={0}>
      <Split
        direction="column"
        weight={weight}
        first={
          <Split
            direction="row"
            weight={0.5}
            first={<Pane label="A" />}
            second={<Pane label="B" />}
          />
        }
        second={<Pane label="C" />}
      />
    </Box>
  )
}

/**
 * Helper: assert the vertical `│` divider does not paint below the horizontal
 * `─` divider row (which marks the top of the bottom pane).
 */
function expectNoVerticalBleed(text: string, weight: number): void {
  const lines = text.split("\n")
  const hRow = lines.findIndex((l) => l.includes("─"))
  expect(
    hRow,
    `no horizontal divider row found at weight=${weight}:\n${text}`,
  ).toBeGreaterThanOrEqual(0)
  const bledRows = lines.map((l, i) => (i > hRow && l.includes("│") ? i : -1)).filter((i) => i >= 0)
  expect(
    bledRows,
    `vertical │ bled into bottom pane (rows below hDivider=${hRow}) at weight=${weight}:\n${text}`,
  ).toEqual([])
}

describe("regression: vertical PaneDivider extent in nested column>row split (C1 bleed)", () => {
  for (const weight of [0.5, 0.55, 0.6, 0.45, 0.7, 0.65, 0.4]) {
    test(`weight=${weight} — vertical │ stays inside the top region`, () => {
      const render = createRenderer({ cols: COLS, rows: ROWS })
      const app = render(<Deck3Pane weight={weight} />)
      // Both dividers must be present.
      expect(app.text).toContain("│")
      expect(app.text).toContain("─")
      expectNoVerticalBleed(app.text, weight)
    })
  }

  test("focus-toggle sequence (rerender) keeps the vertical divider bounded", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<Deck3Pane weight={0.5} />)
    expectNoVerticalBleed(app.text, 0.5)
    // Simulate a focus change re-render (no layout change) then a weight nudge.
    app.rerender(<Deck3Pane weight={0.5} />)
    expectNoVerticalBleed(app.text, 0.5)
    app.rerender(<Deck3Pane weight={0.55} />)
    expectNoVerticalBleed(app.text, 0.55)
  })
})
