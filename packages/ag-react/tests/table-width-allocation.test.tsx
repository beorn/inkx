/**
 * The width-allocation gate for tables (@si/apportion-consolidation).
 *
 * Acceptance criterion, operator-ruled, both directions of the same invariant:
 * across a width sweep no column may sit on width it cannot use while a
 * sibling is squeezed below what it needs. Concretely:
 *
 *  1. CAP — no column holds more than its longest cell content (max-content)
 *     while a sibling wraps below its own.
 *  2. FLOOR — no column renders below its longest unbreakable word
 *     (min-content) while a sibling holds more than ITS min-content. The
 *     quadratic flexShrink allocation this bead replaces fails exactly here:
 *     shrink weight is basis², so a long prose column absorbs nearly the whole
 *     deficit and stacks a few characters per line while short columns yield
 *     almost nothing.
 *
 * Fixture mirrors the measured defect specimen (the pm-plan I19 table):
 * short id / medium label / long prose with max-content around 200 cells.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { displayWidth } from "@silvery/ag-term/unicode"
import { Box } from "../src/components/Box"
import { Content } from "../src/ui/components/Content"

const HEADERS = ["Rung", "What lands", "Why"]
const ROWS: string[][] = [
  [
    "0 · shadow",
    "shadow folds land first because everything else reads through them",
    "state was written down rather than derived, so a stale copy could disagree with reality and nothing noticed; " +
      "a jammed seat read as stopped for twelve hours and the wrong diagnosis prescribed the wrong remedy",
  ],
  [
    "1 · services",
    "service supervision and the spawner-written source receipt",
    "services running four-day-old code while reporting healthy is the exact failure the receipt makes impossible, " +
      "because status is never written, only folded, and generation drift is an integer comparison",
  ],
  [
    "5 · habwire",
    "reply-is-the-close across two logs",
    "a broadcast with no delivery proof reached six seats, missed the seventh, and nothing anywhere said so; " +
      "completion is asserted by the consumer, never inferred by the producer",
  ],
]

/** Total horizontal cell chrome under the document presentation (padding = 2, no separators). */
const CELL_CHROME = 2

const maxContent = (columnIndex: number): number =>
  Math.max(displayWidth(HEADERS[columnIndex]!), ...ROWS.map((row) => displayWidth(row[columnIndex]!)))

const minContent = (columnIndex: number): number =>
  Math.max(
    ...HEADERS[columnIndex]!.split(" ").map(displayWidth),
    ...ROWS.flatMap((row) => row[columnIndex]!.split(" ").map(displayWidth)),
  )

function renderTable(cols: number) {
  const render = createRenderer({ cols, rows: 60 })
  return render(
    <Box width={cols} flexDirection="column">
      <Content.Layout fill={false} prose={80} wide={120}>
        <Content.Row>
          <Content.Body width="auto">
            <Content.Table headers={HEADERS} rows={ROWS} />
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
}

type App = ReturnType<ReturnType<typeof createRenderer>>

/** The track cell Box owning a rendered text: nearest ancestor with cell chrome. */
function cellWidth(app: App, text: string): number {
  let node = app.getByText(text).resolve()
  while (node) {
    const props = node.props as Record<string, unknown>
    if (props.overflow === "hidden" && props.paddingRight !== undefined) {
      if (node.boxRect === null) throw new Error(`cell for ${JSON.stringify(text)} has no computed box`)
      return node.boxRect.width
    }
    node = node.parent
  }
  throw new Error(`no cell ancestor for ${JSON.stringify(text)}`)
}

function textHeight(app: App, text: string): number {
  const node = app.getByText(text).resolve()
  if (node === null || node.boxRect === null) throw new Error(`no rendered box for ${JSON.stringify(text)}`)
  return node.boxRect.height
}

describe("table width allocation (@si/apportion-consolidation gate)", () => {
  test("FLOOR: no column below its min-content while a sibling holds more than its own min-content", () => {
    const violations: string[] = []
    for (let cols = 70; cols <= 160; cols += 10) {
      const app = renderTable(cols)
      const widths = HEADERS.map((header) => cellWidth(app, header))

      for (let i = 0; i < HEADERS.length; i++) {
        const starved = widths[i]! < minContent(i) + CELL_CHROME
        if (!starved) continue
        const donor = widths.some((w, j) => j !== i && w > minContent(j) + CELL_CHROME)
        if (donor) {
          violations.push(
            `cols=${cols}: column ${JSON.stringify(HEADERS[i])} at ${widths[i]} cells is below its ` +
              `min-content ${minContent(i) + CELL_CHROME} while a sibling holds spare width; ` +
              `column widths ${JSON.stringify(widths)}, ` +
              `min-contents ${JSON.stringify(HEADERS.map((_, j) => minContent(j) + CELL_CHROME))}`,
          )
        }
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })

  test("CAP: no column holds beyond its max-content while a sibling wraps", () => {
    const violations: string[] = []
    for (let cols = 70; cols <= 160; cols += 10) {
      const app = renderTable(cols)
      const widths = HEADERS.map((header) => cellWidth(app, header))
      const anyWrapping = HEADERS.some((_, i) => ROWS.some((row) => textHeight(app, row[i]!) > 1))
      if (!anyWrapping) continue

      for (let i = 0; i < HEADERS.length; i++) {
        const allowed = maxContent(i) + CELL_CHROME
        if (widths[i]! > allowed) {
          violations.push(
            `cols=${cols}: column ${JSON.stringify(HEADERS[i])} holds ${widths[i]} cells for ` +
              `${maxContent(i)} chars of content (allowed ${allowed}) while a sibling wraps; ` +
              `column widths ${JSON.stringify(widths)}`,
          )
        }
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })
})
