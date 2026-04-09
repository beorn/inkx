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

  test("cursor: j/k/h/l navigation", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("j")
    app.press("k")
    app.press("l") // cross-column
    app.press("j")
    app.press("h") // back
    app.press("k")
  })

  test("cursor: gg and G (first/last)", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("j")
    app.press("j")
    app.type("gg") // first
    app.press("G") // last
    app.type("gg") // back to first
  })

  test("cursor: page jump Ctrl+D/U", () => {
    using app = createTestApp(realisticBoard())
    app.press("Control+d")
    app.press("Control+u")
    app.press("Control+d")
    app.press("Control+d")
    app.press("Control+u")
  })

  test("cursor: block nav J/K", () => {
    using app = createTestApp(realisticBoard())
    app.press("J") // block nav down
    app.press("J")
    app.press("K") // block nav up
  })

  // =========================================================================
  // Category 2: Detail pane
  // =========================================================================

  test("detail: D open/close cycle", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("D") // open
    app.press("D") // focus
    app.press("D") // close
    app.press("j")
  })

  test("detail: navigate while open", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("D") // open
    app.press("h") // back to board
    app.press("j") // navigate in board
    app.press("j")
    app.press("D") // close
  })

  test("detail: open on different items", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("D") // open on first task
    app.press("h")
    app.press("j") // move to second task
    // Detail should update
    app.press("D") // close
    app.press("l") // move to Waiting column
    app.press("j") // first waiting task
    app.press("D") // open detail on waiting task
    app.press("D") // focus
    app.press("D") // close
  })

  // =========================================================================
  // Category 3: Fold/Unfold
  // =========================================================================

  test("fold: H/L single item", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("H") // fold
    app.press("L") // unfold
    app.press("H") // fold again
    app.press("H") // fold deeper
    app.press("L") // unfold one level
    app.press("L") // unfold all
  })

  test("fold: </> board-wide", () => {
    using app = createTestApp(realisticBoard())
    app.press("<") // fold all
    app.press("<") // fold deeper
    app.press(">") // unfold
    app.press(">") // unfold more
  })

  // =========================================================================
  // Category 4: Search
  // =========================================================================

  test("search: / open, type, navigate, close", async () => {
    using app = createTestApp(realisticBoard())
    app.press("/")
    app.type("tax")
    app.press("Escape")
  })

  // =========================================================================
  // Category 5: Selection
  // =========================================================================

  test("selection: Space toggle", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press(" ") // select
    app.press("j")
    app.press(" ") // select second
    app.press(" ") // deselect second
    app.press("k")
    app.press(" ") // deselect first
  })

  // =========================================================================
  // Category 6: Zoom
  // =========================================================================

  test("zoom: z in, Z out", async () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("z") // zoom in
    app.press("j")
    app.press("j")
    app.press("Z") // zoom out
  })

  test("zoom: deep zoom and back", () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("z") // zoom into card
    app.press("j")
    app.press("z") // zoom deeper
    app.press("Z") // out
    app.press("Z") // out to root
  })

  // =========================================================================
  // Category 7: View modes
  // =========================================================================

  test("content lines: . and ,", async () => {
    using app = createTestApp(realisticBoard())
    app.press(".")
    app.press(".")
    app.press(",")
    app.press(",")
  })

  // =========================================================================
  // Category 8: Edit entry/exit
  // =========================================================================

  test("edit: i enter, Escape exit", async () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("i") // enter edit
    app.press("Escape") // exit
    app.press("j") // verify navigation works after
  })

  test("edit: Enter enter, Escape exit", async () => {
    using app = createTestApp(realisticBoard())
    app.press("j")
    app.press("Enter") // enter edit
    app.press("Escape") // exit
  })

  // =========================================================================
  // Category 9: Help
  // =========================================================================

  test("help: ? open, Escape close", async () => {
    using app = createTestApp(realisticBoard())
    app.press("?")
    app.press("j") // scroll in help
    app.press("k")
    app.press("Escape") // close help
  })

  // =========================================================================
  // Category 10: Combined sequences
  // =========================================================================

  test("combined: navigate, zoom, detail, fold, navigate", async () => {
    using app = createTestApp(realisticBoard())
    // Navigate
    app.press("j")
    app.press("l")
    app.press("j")
    // Zoom
    app.press("z")
    // Detail
    app.press("D")
    app.press("D")
    app.press("D")
    // Fold
    app.press("H")
    app.press("L")
    // Zoom out
    app.press("Z")
    // Navigate
    app.press("h")
    app.press("j")
  })

  test("combined: rapid mixed operations", () => {
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
      app.press(key)
    }
  })

  // =========================================================================
  // Category 11: Different terminal sizes
  // =========================================================================

  test("small terminal: 40x10", () => {
    using app = createTestApp(realisticBoard(), { cols: 40, rows: 10 })
    app.press("j")
    app.press("l")
    app.press("D")
    app.press("D")
    app.press("D")
  })

  test("wide terminal: 200x50", () => {
    using app = createTestApp(realisticBoard(), { cols: 200, rows: 50 })
    app.press("j")
    app.press("l")
    app.press("j")
    app.press("D")
    app.press("D")
    app.press("D")
    app.press("z")
    app.press("Z")
  })
})
