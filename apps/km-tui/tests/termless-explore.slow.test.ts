/**
 * Exhaustive exploration via board driver + STRICT_TERMINAL verification.
 *
 * Uses createTestApp (headless backend) which wraps createBoardDriver with
 * withDiagnostics to verify both buffer correctness AND ANSI output. This catches:
 * - Incremental rendering mismatches (buffer level)
 * - ANSI generation bugs (output phase level)
 * - Terminal interpretation bugs (xterm.js level)
 *
 * Unlike TTY MCP (unreliable Unicode text extraction) or PTY tests (flaky,
 * require vault setup), this approach is fast, reliable, and in-process.
 */
import { describe, test } from "vitest"
import { createTestApp, realisticBoard } from "./helpers/test-app.ts"

describe("Exhaustive exploration via board driver + diagnostics", () => {
  // =========================================================================
  // Category 1: Cursor movement
  // =========================================================================

  test("cursor: j/k/h/l navigation", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("j")
    await app.press("k")
    await app.press("l") // cross-column
    await app.press("j")
    await app.press("h") // back
    await app.press("k")
  })

  test("cursor: gg and G (first/last)", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("j")
    await app.press("j")
    await app.type("gg") // first
    await app.press("G") // last
    await app.type("gg") // back to first
  })

  test("cursor: page jump Ctrl+D/U", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("Control+d")
    await app.press("Control+u")
    await app.press("Control+d")
    await app.press("Control+d")
    await app.press("Control+u")
  })

  test("cursor: block nav J/K", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("J") // block nav down
    await app.press("J")
    await app.press("K") // block nav up
  })

  // =========================================================================
  // Category 2: Detail pane
  // =========================================================================

  test("detail: D open/close cycle", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("D") // open
    await app.press("D") // focus
    await app.press("D") // close
    await app.press("j")
  })

  test("detail: navigate while open", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("D") // open
    await app.press("h") // back to board
    await app.press("j") // navigate in board
    await app.press("j")
    await app.press("D") // close
  })

  test("detail: open on different items", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("D") // open on first task
    await app.press("h")
    await app.press("j") // move to second task
    // Detail should update
    await app.press("D") // close
    await app.press("l") // move to Waiting column
    await app.press("j") // first waiting task
    await app.press("D") // open detail on waiting task
    await app.press("D") // focus
    await app.press("D") // close
  })

  // =========================================================================
  // Category 3: Fold/Unfold
  // =========================================================================

  test("fold: H/L single item", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("H") // fold
    await app.press("L") // unfold
    await app.press("H") // fold again
    await app.press("H") // fold deeper
    await app.press("L") // unfold one level
    await app.press("L") // unfold all
  })

  test("fold: </> board-wide", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("<") // fold all
    await app.press("<") // fold deeper
    await app.press(">") // unfold
    await app.press(">") // unfold more
  })

  // =========================================================================
  // Category 4: Search
  // =========================================================================

  test("search: / open, type, navigate, close", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("/")
    await app.type("tax")
    await app.press("Escape")
  })

  // =========================================================================
  // Category 5: Selection
  // =========================================================================

  test("selection: Space toggle", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press(" ") // select
    await app.press("j")
    await app.press(" ") // select second
    await app.press(" ") // deselect second
    await app.press("k")
    await app.press(" ") // deselect first
  })

  // =========================================================================
  // Category 6: Zoom
  // =========================================================================

  test("zoom: z in, Z out", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("z") // zoom in
    await app.press("j")
    await app.press("j")
    await app.press("Z") // zoom out
  })

  test("zoom: deep zoom and back", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("z") // zoom into card
    await app.press("j")
    await app.press("z") // zoom deeper
    await app.press("Z") // out
    await app.press("Z") // out to root
  })

  // =========================================================================
  // Category 7: View modes
  // =========================================================================

  test("content lines: . and ,", async () => {
    using app = createTestApp(realisticBoard())
    await app.press(".")
    await app.press(".")
    await app.press(",")
    await app.press(",")
  })

  // =========================================================================
  // Category 8: Edit entry/exit
  // =========================================================================

  test("edit: i enter, Escape exit", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("i") // enter edit
    await app.press("Escape") // exit
    await app.press("j") // verify navigation works after
  })

  test("edit: Enter enter, Escape exit", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("j")
    await app.press("Enter") // enter edit
    await app.press("Escape") // exit
  })

  // =========================================================================
  // Category 9: Help
  // =========================================================================

  test("help: ? open, Escape close", async () => {
    using app = createTestApp(realisticBoard())
    await app.press("?")
    await app.press("j") // scroll in help
    await app.press("k")
    await app.press("Escape") // close help
  })

  // =========================================================================
  // Category 10: Combined sequences
  // =========================================================================

  test("combined: navigate, zoom, detail, fold, navigate", async () => {
    using app = createTestApp(realisticBoard())
    // Navigate
    await app.press("j")
    await app.press("l")
    await app.press("j")
    // Zoom
    await app.press("z")
    // Detail
    await app.press("D")
    await app.press("D")
    await app.press("D")
    // Fold
    await app.press("H")
    await app.press("L")
    // Zoom out
    await app.press("Z")
    // Navigate
    await app.press("h")
    await app.press("j")
  })

  test("combined: rapid mixed operations", async () => {
    using app = createTestApp(realisticBoard())
    const ops = [
      "j",
      "j",
      "l",
      "j",
      "h",
      "k",
      "z",
      "j",
      "j",
      "Z",
      "D",
      "D",
      "D",
      "H",
      "L",
      "<",
      ">",
      " ",
      "j",
      " ",
      " ",
      "k",
      "h",
    ]
    for (const key of ops) {
      await app.press(key)
    }
  })

  // =========================================================================
  // Category 11: Different terminal sizes
  // =========================================================================

  test("small terminal: 40x10", async () => {
    using app = createTestApp(realisticBoard(), { cols: 40, rows: 10 })
    await app.press("j")
    await app.press("l")
    await app.press("D")
    await app.press("D")
    await app.press("D")
  })

  test("wide terminal: 200x50", async () => {
    using app = createTestApp(realisticBoard(), { cols: 200, rows: 50 })
    await app.press("j")
    await app.press("l")
    await app.press("j")
    await app.press("D")
    await app.press("D")
    await app.press("D")
    await app.press("z")
    await app.press("Z")
  })
})
