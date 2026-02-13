/**
 * Exploration: Boundary cases — empty boards, single-item boards, many columns,
 * very deep nesting, operations on empty columns.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Boundary Cases", () => {
  test("board with single empty column", () => {
    const { board } = testEnv(() => item("board", item("col1")))
    const bugs: string[] = []

    board.press("j")
    board.press("k")
    board.press("d")
    board.press("Backspace")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in single empty column board")
    }
    expect(bugs).toEqual([])
  })

  test("board with many columns (8)", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("c1", item("a1")),
        item("c2", item("a2")),
        item("c3", item("a3")),
        item("c4", item("a4")),
        item("c5", item("a5")),
        item("c6", item("a6")),
        item("c7", item("a7")),
        item("c8", item("a8")),
      ),
    )
    const bugs: string[] = []

    // Navigate all the way right
    for (let i = 0; i < 10; i++) board.press("l")
    // Navigate all the way left
    for (let i = 0; i < 10; i++) board.press("h")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in 8-column board navigation")
    }
    expect(bugs).toEqual([])
  })

  test("deep nesting navigation", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("L1", item("L2", item("L3", item("L4", item("L5", item("deepest")))))))),
    )
    const bugs: string[] = []

    // Navigate into deep structure
    board.press("j")
    board.press("j")
    board.press("j")
    board.press("j")
    board.press("j")
    board.press("k")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in deep nesting navigation")
    }
    expect(bugs).toEqual([])
  })

  test("board with only one card", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("only"))))
    const bugs: string[] = []

    // Various operations on single card
    board.press("j") // boundary
    board.press("k") // boundary
    board.press("J") // selection (nothing to select)
    board.press("d") // duplicate
    board.press("Ctrl+Z") // undo

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in single-card operations")
    }
    expect(bugs).toEqual([])
  })

  test("delete all cards in column then navigate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("Backspace") // delete A
    board.press("Backspace") // delete B — col1 now empty

    // Navigate to col2
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after emptying column + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("many items column (20 items) with scrolling", () => {
    const { board } = testEnv(() => {
      const items = Array.from({ length: 20 }, (_, i) => item(`item${i + 1}`))
      return item("board", item("col1", ...items))
    })
    const bugs: string[] = []

    // Navigate to bottom
    for (let i = 0; i < 25; i++) board.press("j")
    // Navigate back to top
    for (let i = 0; i < 25; i++) board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in long column scrolling")
    }
    expect(bugs).toEqual([])
  })

  test("narrow terminal (30 cols) operations", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))), {
      columns: 30,
      rows: 10,
    })
    const bugs: string[] = []

    board.press("j")
    board.press("l")
    board.press("d")
    board.press("Ctrl+Z")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in narrow terminal")
    }
    expect(bugs).toEqual([])
  })

  test("very wide terminal (200 cols)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))), {
      columns: 200,
      rows: 40,
    })
    const bugs: string[] = []

    board.press("j")
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in wide terminal")
    }
    expect(bugs).toEqual([])
  })

  test("Tab indent on first card (no previous sibling)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("Tab") // indent A — no previous sibling to indent under

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Tab on first card")
    }
    expect(bugs).toEqual([])
  })

  test("Shift+Tab outdent at top level", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Shift+Tab") // outdent A — already at top level

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Shift+Tab at top level")
    }
    expect(bugs).toEqual([])
  })

  test("gg goes to first card, G goes to last", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))
    const bugs: string[] = []

    board.press("j").press("j") // → C
    board.press("g").press("g") // → A (first)
    board.press("G") // → E (last)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after gg/G navigation")
    }
    expect(bugs).toEqual([])
  })
})
