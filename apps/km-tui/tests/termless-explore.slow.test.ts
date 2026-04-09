/**
 * Exhaustive exploration via board driver + STRICT_TERMINAL verification.
 *
 * Uses createBoardDriver with withDiagnostics to verify both buffer correctness
 * AND ANSI output through xterm.js (STRICT_TERMINAL=xterm). This catches:
 * - Incremental rendering mismatches (buffer level)
 * - ANSI generation bugs (output phase level)
 * - Terminal interpretation bugs (xterm.js level)
 *
 * Unlike TTY MCP (unreliable Unicode text extraction) or PTY tests (flaky,
 * require vault setup), this approach is fast, reliable, and in-process.
 */
import { describe, test } from "vitest"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"

/** Create a realistic board fixture with varied content */
function realisticBoard() {
  return item(
    "board",
    item(
      "Next",
      item.task("Buy groceries"),
      item.task("Fix plumbing — call 2024-01-16"),
      item(
        "+Taxes — reply to @Shubam",
        item("(1) confirm Q1 figures"),
        item("(2) send W-2 copies"),
      ),
      item.task("Schedule dentist"),
    ),
    item(
      "Waiting",
      item.task("@JoseChu — file US Form 4868 extension"),
      item.task("Insurance claim #4421"),
    ),
    item(
      "Inbox",
      item("2025 Tax Document.pdf"),
      item("Meeting notes from Monday"),
      item("Project Alpha kickoff"),
      item("Review **bold text** and `code blocks`"),
    ),
    item("Done", item.task("Set up direct deposit"), item.task("File Q4 report")),
    item("Archived", item("Old project notes")),
  )
}

function createExploreDriver(cols = 120, rows = 30) {
  const nodes = realisticBoard()
  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  return withDiagnostics(
    createBoardDriver(repo, boardRootId, { columns: cols, rows }),
    {
      checkIncremental: true,
      checkStability: true,
      skipLines: [0, -1], // breadcrumb and status bar may have timing diffs
    },
  )
}

describe("Exhaustive exploration via board driver + diagnostics", () => {
  // =========================================================================
  // Category 1: Cursor movement
  // =========================================================================

  test("cursor: j/k/h/l navigation", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("j")
    await d.press("k")
    await d.press("l") // cross-column
    await d.press("j")
    await d.press("h") // back
    await d.press("k")
  })

  test("cursor: gg and G (first/last)", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("j")
    await d.press("j")
    await d.type("gg") // first
    await d.press("G") // last
    await d.type("gg") // back to first
  })

  test("cursor: page jump Ctrl+D/U", async () => {
    const d = createExploreDriver()
    await d.press("Control+d")
    await d.press("Control+u")
    await d.press("Control+d")
    await d.press("Control+d")
    await d.press("Control+u")
  })

  test("cursor: block nav J/K", async () => {
    const d = createExploreDriver()
    await d.press("J") // block nav down
    await d.press("J")
    await d.press("K") // block nav up
  })

  // =========================================================================
  // Category 2: Detail pane
  // =========================================================================

  test("detail: D open/close cycle", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("D") // open
    await d.press("D") // focus
    await d.press("D") // close
    await d.press("j")
  })

  test("detail: navigate while open", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("D") // open
    await d.press("h") // back to board
    await d.press("j") // navigate in board
    await d.press("j")
    await d.press("D") // close
  })

  test("detail: open on different items", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("D") // open on first task
    await d.press("h")
    await d.press("j") // move to second task
    // Detail should update
    await d.press("D") // close
    await d.press("l") // move to Waiting column
    await d.press("j") // first waiting task
    await d.press("D") // open detail on waiting task
    await d.press("D") // focus
    await d.press("D") // close
  })

  // =========================================================================
  // Category 3: Fold/Unfold
  // =========================================================================

  test("fold: H/L single item", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("H") // fold
    await d.press("L") // unfold
    await d.press("H") // fold again
    await d.press("H") // fold deeper
    await d.press("L") // unfold one level
    await d.press("L") // unfold all
  })

  test("fold: </> board-wide", async () => {
    const d = createExploreDriver()
    await d.press("<") // fold all
    await d.press("<") // fold deeper
    await d.press(">") // unfold
    await d.press(">") // unfold more
  })

  // =========================================================================
  // Category 4: Search
  // =========================================================================

  test("search: / open, type, navigate, close", async () => {
    const d = createExploreDriver()
    await d.press("/")
    await d.type("tax")
    await d.press("Escape")
  })

  // =========================================================================
  // Category 5: Selection
  // =========================================================================

  test("selection: Space toggle", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press(" ") // select
    await d.press("j")
    await d.press(" ") // select second
    await d.press(" ") // deselect second
    await d.press("k")
    await d.press(" ") // deselect first
  })

  // =========================================================================
  // Category 6: Zoom
  // =========================================================================

  test("zoom: z in, Z out", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("z") // zoom in
    await d.press("j")
    await d.press("j")
    await d.press("Z") // zoom out
  })

  test("zoom: deep zoom and back", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("z") // zoom into card
    await d.press("j")
    await d.press("z") // zoom deeper
    await d.press("Z") // out
    await d.press("Z") // out to root
  })

  // =========================================================================
  // Category 7: View modes
  // =========================================================================

  test("content lines: . and ,", async () => {
    const d = createExploreDriver()
    await d.press(".")
    await d.press(".")
    await d.press(",")
    await d.press(",")
  })

  // =========================================================================
  // Category 8: Edit entry/exit
  // =========================================================================

  test("edit: i enter, Escape exit", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("i") // enter edit
    await d.press("Escape") // exit
    await d.press("j") // verify navigation works after
  })

  test("edit: Enter enter, Escape exit", async () => {
    const d = createExploreDriver()
    await d.press("j")
    await d.press("Enter") // enter edit
    await d.press("Escape") // exit
  })

  // =========================================================================
  // Category 9: Help
  // =========================================================================

  test("help: ? open, Escape close", async () => {
    const d = createExploreDriver()
    await d.press("?")
    await d.press("j") // scroll in help
    await d.press("k")
    await d.press("Escape") // close help
  })

  // =========================================================================
  // Category 10: Combined sequences
  // =========================================================================

  test("combined: navigate, zoom, detail, fold, navigate", async () => {
    const d = createExploreDriver()
    // Navigate
    await d.press("j")
    await d.press("l")
    await d.press("j")
    // Zoom
    await d.press("z")
    // Detail
    await d.press("D")
    await d.press("D")
    await d.press("D")
    // Fold
    await d.press("H")
    await d.press("L")
    // Zoom out
    await d.press("Z")
    // Navigate
    await d.press("h")
    await d.press("j")
  })

  test("combined: rapid mixed operations", async () => {
    const d = createExploreDriver()
    const ops = [
      "j", "j", "l", "j", "h", "k",
      "z", "j", "j", "Z",
      "D", "D", "D",
      "H", "L",
      "<", ">",
      " ", "j", " ", " ",
      "k", "h",
    ]
    for (const key of ops) {
      await d.press(key)
    }
  })

  // =========================================================================
  // Category 11: Different terminal sizes
  // =========================================================================

  test("small terminal: 40x10", async () => {
    const d = createExploreDriver(40, 10)
    await d.press("j")
    await d.press("l")
    await d.press("D")
    await d.press("D")
    await d.press("D")
  })

  test("wide terminal: 200x50", async () => {
    const d = createExploreDriver(200, 50)
    await d.press("j")
    await d.press("l")
    await d.press("j")
    await d.press("D")
    await d.press("D")
    await d.press("D")
    await d.press("z")
    await d.press("Z")
  })
})
