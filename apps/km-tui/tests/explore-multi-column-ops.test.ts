/**
 * Exploration: Multi-column operations — cross-column navigation, moves,
 * selection across columns, column jumps.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// NOTE: 3+ columns at default 80-col width triggers collapsedNodes crash (BUG 4).
// Use wider terminal (120 cols) to avoid collapse code path and test actual operations.
const WIDE = { columns: 120, rows: 24 }

describe("Exploration: Multi-Column Operations", () => {
  test("move item across 3 columns", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
      WIDE,
    )
    const bugs: string[] = []

    board.press("Alt+l") // move A to col2
    board.press("Alt+l") // move A to col3

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after cross-3-column move")
    }
    expect(bugs).toEqual([])
  })

  test("shift+number column jumps with operations", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
      WIDE,
    )
    const bugs: string[] = []

    board.press("#") // Shift+3 → col3
    board.press("d") // duplicate C
    board.press("!") // Shift+1 → col1
    board.press("d") // duplicate A

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column jumps + operations")
    }
    expect(bugs).toEqual([])
  })

  test("navigate to empty column between filled columns", () => {
    const { board, repo } = testEnv(
      () => item("board", item("col1", item("A")), item("col2", item("middle")), item("col3", item("C"))),
      WIDE,
    )
    const bugs: string[] = []

    // Delete item in col2 to make it empty
    board.press("l") // → col2
    board.press("Backspace") // delete middle — col2 empty
    board.press("l") // → col3
    board.press("h") // → col2 (empty)
    board.press("h") // → col1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after navigating through empty column")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+l on last column (boundary)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const bugs: string[] = []

    board.press("l") // → col2
    board.press("Alt+l") // move B right — no col to the right

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+l on last column")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+h on first column (boundary)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const bugs: string[] = []

    board.press("Alt+h") // move A left — no col to the left

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+h on first column")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate then move across columns", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("Alt+l") // move duplicate to col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after duplicate + cross-column move")
    }
    expect(bugs).toEqual([])
  })

  test("select across columns with Shift+H/L", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("L") // Shift+L — extend selection to col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Shift+L cross-column select")
    }
    expect(bugs).toEqual([])
  })

  test("fold in one column then navigate to another", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("c1"), item("c2")), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("z").press("a") // fold parent
    board.press("l") // navigate to col2
    board.press("j") // navigate down in col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold in col1 then navigate to col2")
    }
    expect(bugs).toEqual([])
  })

  test("< depth change then column navigation", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("c1"), item("c2")), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("<") // decrease depth
    board.press("l") // navigate to col2
    board.press(">") // increase depth

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < then column nav then >")
    }
    expect(bugs).toEqual([])
  })

  test("multiple columns with different depths after <", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("L1a", item("L2a", item("deep-a"))), item("flat-a")),
        item("col2", item("L1b", item("L2b", item("deep-b"))), item("flat-b")),
      ),
    )
    const bugs: string[] = []

    board.press("<")
    board.press("<")
    board.press("l") // col2
    board.press("j") // navigate
    board.press("h") // back to col1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after < with multi-column deep structure")
    }
    expect(bugs).toEqual([])
  })
})
