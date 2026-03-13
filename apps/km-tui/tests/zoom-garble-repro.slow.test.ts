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
import { item, testEnv } from "./helpers/board-test.ts"

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
  ])("zoom out at $cols x $rows does not garble rendering", ({ cols, rows }) => {
    // Start zoomed into child-board
    const { board } = testEnv(deepTree, { columns: cols, rows })

    // Zoom into child-board
    board.press("z")
    board.expect("#gc-col-A").toExist()

    // Zoom out (Z) — this is where garbling happens
    board.press("Z")

    // After zoom out, we should be back at root with child boards as columns
    board.expect("#child-board").toExist()

    // Explicit incremental vs fresh check
    board.expectIncrementalMatchesFresh()
  })

  test("double zoom out at 200 cols", () => {
    // Even deeper: root > mid > child-board > gc-cols
    const { board } = testEnv(
      () =>
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
      { columns: 200, rows: 50 },
    )

    // Zoom into mid → deep
    board.press("z") // into mid
    board.press("z") // into deep

    board.expect("#col1").toExist()

    // First zoom out
    board.press("Z")
    board.expectIncrementalMatchesFresh()

    // Second zoom out
    board.press("Z")
    board.expectIncrementalMatchesFresh()
  })
})
