/**
 * Bug: visible bg-tinted strip next to "+N more" overflow indicator.
 *
 * Bead: @km/silvery/render-light-blue-bg-strip-residue.
 *
 * When the cursor is on a descendant of a card (cursorInDescendant), the card
 * gets `cardBg = selectedBg(theme)` (~6% accent blend). The bottom row that
 * renders `╰─── +N more ───╯` is a Box with `backgroundColor={cardBg}` —
 * which paints the entire row width with the lighter bg. Adjacent column
 * cells (the inter-column gap to the right) inherit that bg through
 * silvery's bg-cascade, producing a visible strip.
 *
 * This test pins the buffer state: cells immediately AFTER the `╯` of the
 * overflow indicator must NOT have the card-tint bg.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { item, createTestApp } from "./helpers/create-test-app.ts"

describe("overflow indicator bg residue", () => {
  test("trailing cells after '+N more' indicator do not bleed card-tint bg into next column", () => {
    // Build two columns. col-A has a card with 6 children → triggers overflow
    // (maxContentLines = 3 default). col-B is a sibling. Cursor is on a child
    // of card-A so the card carries selectedBg() tint, exercising the bg path.
    const nodes = item(
      "board",
      item(
        "col-A",
        item(
          "card-A",
          item("child-1"),
          item("child-2"),
          item("child-3"),
          item("child-4"),
          item("child-5"),
          item("child-6"),
        ),
      ),
      item("col-B", item("card-B", item("note"))),
    )

    using app = createTestApp(nodes, {
      cols: 80,
      rows: 24,
    })

    // Unfold card-A's children (L), then descend into them (j) so cursor
    // lands on child-1 — exercises cursorInDescendant which sets
    // cardBg = selectedBg(theme) on the overflow row.
    app.press("L") // unfold_more — exposes children for navigation
    app.press("j") // step into child-1

    expect(app.text).toContain("more")
    expect(app.state.cursor).toBe("child-1")
    const lines = app.text.split("\n")
    const moreRow = lines.findIndex((l) => l.includes("more"))
    expect(moreRow, "an overflow row must be visible").toBeGreaterThanOrEqual(0)

    const line = lines[moreRow]!
    const closeIdx = line.indexOf("╯")
    expect(closeIdx, "expected closing '╯' on the overflow row").toBeGreaterThan(0)

    // Sample bg of the indicator-row interior (under "+N more"): this IS
    // expected to carry the card tint.
    const insideCell = app.cell(closeIdx - 5, moreRow)
    const insideBg = insideCell.bg

    // Sample bg AFTER the closing '╯'. The strip-residue bug paints these
    // cells with the same tint as inside the indicator. Correct behavior:
    // those cells are inter-column space (column-bg or null), not card tint.
    const trailingCells: Array<{ col: number; bg: unknown }> = []
    for (let col = closeIdx + 1; col < Math.min(line.length, closeIdx + 10); col++) {
      trailingCells.push({ col, bg: app.cell(col, moreRow).bg })
    }

    // Find at least one trailing cell whose bg is the same as the inside-tint.
    // The bug = trailing strip with insideBg. Correct = none.
    const insideKey = JSON.stringify(insideBg)
    const leakedCells = trailingCells.filter((c) => JSON.stringify(c.bg) === insideKey)

    expect(
      leakedCells.length,
      `Card-tint bg leaked past '╯' on row ${moreRow}: ${leakedCells.length} cells. ` +
        `inside-bg=${insideKey}, trailing=${trailingCells.map((c) => `${c.col}:${JSON.stringify(c.bg)}`).join(",")}`,
    ).toBe(0)
  })
})
