/**
 * Reproduction test for zoom-out rendering garble at wide terminal widths.
 *
 * Bug: When pressing Z (zoom outwards) at 200+ cols, the screen becomes
 * garbled with stale content fragments from the previous zoom level.
 * Each subsequent Z makes it worse.
 *
 * Repro: `SILVERY_STRICT=1 km view --repo imports/asana launch-academy`
 * then press Z twice in Ghostty.
 */
import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp, type CellInfo } from "./helpers/test-app.ts"
import { TC } from "./helpers/theme.ts"

/** Deep-compare cell bg/fg (RGB objects) to a TC constant */
function colorEquals(a: CellInfo["fg"], b: { r: number; g: number; b: number }): boolean {
  if (a === null || a === undefined || typeof a === "number") return false
  return (
    typeof a === "object" &&
    (a as { r: number; g: number; b: number }).r === b.r &&
    (a as { r: number; g: number; b: number }).g === b.g &&
    (a as { r: number; g: number; b: number }).b === b.b
  )
}

// Build a tree deep enough for zoom: root > child-board > grandchild columns with cards
function deepTree() {
  return item(
    "root",
    item(
      "child-board",
      item("gc-col-A", item("card-A1"), item("card-A2"), item("card-A3")),
      item("gc-col-B", item("card-B1"), item("card-B2"), item("card-B3")),
      item("gc-col-C", item("card-C1"), item("card-C2"), item("card-C3")),
      item("gc-col-D", item("card-D1"), item("card-D2"), item("card-D3")),
      item("gc-col-E", item("card-E1"), item("card-E2"), item("card-E3")),
    ),
    item(
      "child-board-2",
      item("gc-col-F", item("card-F1"), item("card-F2")),
      item("gc-col-G", item("card-G1"), item("card-G2")),
    ),
    item(
      "child-board-3",
      item("gc-col-H", item("card-H1"), item("card-H2")),
      item("gc-col-I", item("card-I1"), item("card-I2")),
    ),
  )
}

describe("Zoom-out rendering at wide terminal", () => {
  // Wide terminal sizes that trigger the garbling
  test.each([
    { cols: 200, rows: 50 },
    { cols: 160, rows: 40 },
    { cols: 120, rows: 30 },
  ])("zoom out at $cols x $rows does not garble rendering", async ({ cols, rows }) => {
    // Start zoomed into child-board
    using app = createTestApp(deepTree(), { cols, rows })

    // Zoom into child-board
    app.press("z")
    app.expect("#gc-col-A").toExist()

    // Zoom out (Z) — this is where garbling happens
    app.press("Z")

    // After zoom out, we should be back at root with child boards as columns
    app.expect("#child-board").toExist()

    // Incremental vs fresh check is enabled by default via withDiagnostics
    // (checkIncremental: true is the createTestApp default)
  })

  test("double zoom out at 200 cols", () => {
    // Even deeper: root > mid > child-board > gc-cols
    using app = createTestApp(
      item(
        "root",
        item(
          "mid",
          item("deep", item("col1", item("c1")), item("col2", item("c2")), item("col3", item("c3"))),
          item("sibling1", item("s1")),
          item("sibling2", item("s2")),
        ),
        item("other", item("o1"), item("o2")),
      ),
      { cols: 200, rows: 50 },
    )

    // Zoom into mid → deep
    app.press("z") // into mid
    app.press("z") // into deep

    app.expect("#col1").toExist()

    // First zoom out — incremental matches fresh check is automatic via withDiagnostics
    app.press("Z")

    // Second zoom out
    app.press("Z")
  })

  test("breadcrumb bar has no black/empty cells at column 0 after zoom out at 200 cols", () => {
    const cols = 200
    using app = createTestApp(deepTree(), { cols, rows: 50 })

    // Zoom into child-board, then zoom back out
    app.press("z")
    app.expect("#gc-col-A").toExist()
    app.press("Z")
    app.expect("#child-board").toExist()

    // Row 0 is the breadcrumb/top bar. It should have a consistent background
    // color across its full width -- no black/null gaps at the left edge.
    const col0Bg = app.screen.cell(0, 0).bg
    const col1Bg = app.screen.cell(1, 0).bg

    // Column 0 must have the same bg as column 1 (no black gap at left edge)
    expect(col0Bg, "breadcrumb bar column 0 bg should match column 1").toEqual(col1Bg)

    // Check that every cell in row 0 has a non-null background (the top bar
    // should fill the entire row with $selection-bg or similar).
    const nullBgCells: number[] = []
    for (let x = 0; x < cols; x++) {
      const cell = app.screen.cell(x, 0)
      if (cell.bg === null) {
        nullBgCells.push(x)
      }
    }
    expect(
      nullBgCells,
      `breadcrumb bar row 0 has ${nullBgCells.length} cells with null bg at columns: [${nullBgCells.slice(0, 10).join(", ")}${nullBgCells.length > 10 ? "..." : ""}]`,
    ).toHaveLength(0)
  })

  test("selection background stays within selected card bounds after zoom out at 200 cols", () => {
    const cols = 200
    const rows = 50
    using app = createTestApp(deepTree(), { cols, rows })

    // Zoom into child-board, then zoom back out
    app.press("z")
    app.expect("#gc-col-A").toExist()
    app.press("Z")
    app.expect("#child-board").toExist()

    // Move cursor down to select a different card (j moves to next card)
    app.press("j")

    // Find the bounding box of the currently selected card via [data-cursor]
    const cursorLoc = app.q("[data-cursor]")
    expect(cursorLoc.count(), "cursor element should exist after pressing j").toBeGreaterThan(0)
    const selectedNodeId = cursorLoc.getAttribute("id")
    expect(selectedNodeId, "cursor element should have an id attribute").toBeTruthy()

    const selectedBox = cursorLoc.boundingBox()
    expect(selectedBox, `selected node "${selectedNodeId}" should have a bounding box`).not.toBeNull()
    if (!selectedBox) return

    // Sample the selection background color from a cell within the selected card.
    // Find the first cell with $selection-bg inside the card bounds.
    const selectionBg = TC["$selection-bg"]
    let foundSelectionBg = false
    for (let x = selectedBox.x; x < selectedBox.x + selectedBox.width; x++) {
      const cell = app.screen.cell(x, selectedBox.y)
      if (colorEquals(cell.bg, selectionBg)) {
        foundSelectionBg = true
        break
      }
    }
    expect(
      foundSelectionBg,
      `selected card "${selectedNodeId}" should have $selection-bg (${JSON.stringify(selectionBg)}) somewhere in its row`,
    ).toBe(true)

    // Check cells ABOVE the selected card -- they should NOT have $selection-bg.
    // Skip row 0 (breadcrumb bar) which legitimately uses the same bg token.
    const rowsAbove: { x: number; y: number }[] = []
    for (let y = Math.max(1, selectedBox.y - 3); y < selectedBox.y; y++) {
      for (let x = selectedBox.x; x < selectedBox.x + selectedBox.width; x++) {
        const cell = app.screen.cell(x, y)
        if (colorEquals(cell.bg, selectionBg)) {
          rowsAbove.push({ x, y })
        }
      }
    }
    expect(
      rowsAbove,
      `selection bg bleeds above selected card at: ${rowsAbove
        .slice(0, 5)
        .map((p) => `(${p.x},${p.y})`)
        .join(", ")}`,
    ).toHaveLength(0)

    // Check cells BELOW the selected card -- they should NOT have $selection-bg
    const rowsBelow: { x: number; y: number }[] = []
    for (let y = selectedBox.y + selectedBox.height; y < Math.min(rows, selectedBox.y + selectedBox.height + 3); y++) {
      for (let x = selectedBox.x; x < selectedBox.x + selectedBox.width; x++) {
        const cell = app.screen.cell(x, y)
        if (colorEquals(cell.bg, selectionBg)) {
          rowsBelow.push({ x, y })
        }
      }
    }
    expect(
      rowsBelow,
      `selection bg bleeds below selected card at: ${rowsBelow
        .slice(0, 5)
        .map((p) => `(${p.x},${p.y})`)
        .join(", ")}`,
    ).toHaveLength(0)

    // Check cells to the LEFT of the selected card's column -- no bleed
    if (selectedBox.x > 0) {
      const leftBleed: { x: number; y: number }[] = []
      for (let y = selectedBox.y; y < selectedBox.y + selectedBox.height; y++) {
        for (let x = 0; x < selectedBox.x; x++) {
          const cell = app.screen.cell(x, y)
          if (colorEquals(cell.bg, selectionBg)) {
            leftBleed.push({ x, y })
          }
        }
      }
      expect(
        leftBleed,
        `selection bg bleeds left of selected card at: ${leftBleed
          .slice(0, 5)
          .map((p) => `(${p.x},${p.y})`)
          .join(", ")}`,
      ).toHaveLength(0)
    }
  })
})
