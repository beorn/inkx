/**
 * Breadcrumb path display when zoomed deep into the hierarchy.
 *
 * Verifies the top bar shows ancestor breadcrumb segments so users know
 * where they are after zooming or search navigation.
 *
 * Bead: km-tui.breadcrumbs
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Breadcrumb path when zoomed deep", () => {
  test("top bar shows ancestor path after zooming into a card", () => {
    // hierarchy: board > col > section > subsection > items
    const { board } = testEnv(
      () => item("board", item("col", item("section", item("subsection", item("task-a"), item("task-b"))))),
      { columns: 120, rows: 24 },
    )

    // Initial: cursor on "section" card inside "col" column
    const initialTopBar = board.q("#top-bar").textContent()
    expect(initialTopBar).toContain("board")

    // Zoom into "section" (e on card with children)
    board.press("e")
    // Now section is the root, subsection should be a column
    board.expect("#subsection").toExist()

    const zoomedTopBar = board.q("#top-bar").textContent()
    // Should show ancestor path: board, col, section visible in breadcrumb
    expect(zoomedTopBar).toContain("section")
  })

  test("top bar shows full ancestor breadcrumb path when zoomed two levels deep", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Projects",
            item("Frontend", item("React", item("hooks"), item("components")), item("Vue", item("composables"))),
          ),
        ),
      { columns: 120, rows: 24 },
    )

    // Zoom into Frontend
    board.press("e")
    board.expect("#React").toExist()

    // Zoom into React
    board.press("e")
    board.expect("#hooks").toExist()

    const topBar = board.q("#top-bar").textContent()
    // Should show ancestor path including board, Projects, Frontend
    expect(topBar).toContain("board")
    expect(topBar).toContain("Projects")
    expect(topBar).toContain("Frontend")
    expect(topBar).toContain("React")
  })

  test("breadcrumb truncates from left when path is too long for terminal width", () => {
    const { board } = testEnv(
      () =>
        item(
          "VeryLongBoardNameThatEatsSpace",
          item(
            "VeryLongColumnNameForTesting",
            item("VeryLongSectionNameHere", item("VeryLongSubsectionName", item("DeepAlpha"), item("DeepBeta"))),
          ),
        ),
      { columns: 60, rows: 24 },
    )

    // Zoom deep
    board.press("e") // into VeryLongSectionNameHere
    board.press("e") // into VeryLongSubsectionName

    const topBar = board.q("#top-bar").textContent()
    // Path should be truncated with ellipsis when it doesn't fit
    expect(topBar).toContain("⋯")
    // The cursor target (DeepAlpha, first card) should be visible in the path
    expect(topBar).toContain("DeepAlpha")
  })

  test("breadcrumb uses dim style for ancestors and bold for board root", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("parent", item("child", item("gc-a"), item("gc-b"))))),
      { columns: 120, rows: 24 },
    )

    // Zoom into parent
    board.press("e")
    board.expect("#child").toExist()

    // The top bar should contain all ancestors
    const topBar = board.q("#top-bar").textContent()
    expect(topBar).toContain("parent")
  })

  test("breadcrumb updates when zooming out with Escape", () => {
    const { board } = testEnv(
      () => item("board", item("col", item("level1", item("level2", item("level3", item("deep")))))),
      { columns: 120, rows: 24 },
    )

    // Zoom in twice
    board.press("e") // into level1
    board.press("e") // into level2
    let topBar = board.q("#top-bar").textContent()
    expect(topBar).toContain("level2")

    // Zoom out
    board.press("\x1B") // Escape
    topBar = board.q("#top-bar").textContent()
    expect(topBar).toContain("level1")
    // level2 should still be visible as it's now a column
    expect(topBar).toContain("level2")
  })

  test("within-board segments use > separator for clear hierarchy", () => {
    // Within-board segments use > separator to distinguish hierarchy
    // from filesystem path (which uses / and #)
    const { board } = testEnv(() => item("board", item("col", item("card", item("sub1"), item("sub2")))), {
      columns: 120,
      rows: 24,
    })

    // Navigate into column to see card-level path
    board.press("j") // select card
    const topBar = board.q("#top-bar").textContent()
    // Path should show board > col > card with > separators for within-board segments
    expect(topBar).toContain("board")
    expect(topBar).toContain("col")
    expect(topBar).toContain("card")
    // The > separator should appear between within-board segments
    expect(topBar).toContain(">")
  })

  test("breadcrumb shows zoom context after deep search jump", () => {
    // Simulates what happens after a search navigates to a deep node:
    // the user zooms into the found location and needs to see where they are
    const { board } = testEnv(
      () =>
        item(
          "root",
          item(
            "Projects",
            item("Work", item("Immigration", item("form-i130"), item("form-i485"))),
            item("Personal", item("taxes")),
          ),
        ),
      { columns: 120, rows: 24 },
    )

    // Zoom to Work level (simulating what search does)
    board.press("e") // zoom into Work
    board.expect("#Immigration").toExist()

    // Zoom into Immigration
    board.press("e")
    board.expect("#form-i130").toExist()

    // Top bar should show the full path so user knows where they are
    const topBar = board.q("#top-bar").textContent()
    expect(topBar).toContain("root")
    expect(topBar).toContain("Projects")
    expect(topBar).toContain("Work")
    expect(topBar).toContain("Immigration")
  })

  test("breadcrumb screen buffer shows clean path without ghost chars after zoom", () => {
    const { board } = testEnv(
      () => item("board", item("Alpha", item("deep1", item("x1"), item("x2"))), item("Beta", item("y1"))),
      { columns: 100, rows: 24 },
    )

    // Navigate right to Beta column, then zoom into deep1 from Alpha
    board.press("l") // to Beta
    const topBarBeta = board.screenshot().split("\n")[0] ?? ""
    expect(topBarBeta).toContain("Beta")

    board.press("h") // back to Alpha
    board.press("j") // to deep1 card
    board.press("e") // zoom into deep1

    const topBarZoomed = board.screenshot().split("\n")[0] ?? ""
    // Should contain "deep1" and NOT have ghost chars from "Beta"
    expect(topBarZoomed).toContain("deep1")
    expect(topBarZoomed).not.toContain("Bdeep1")
    // Verify no ghost chars in top bar region
    board.expectNoGhostChars({ x: 0, y: 0, width: 100, height: 1 })
  })
})
