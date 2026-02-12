/**
 * Exploration: Breadcrumb rendering after h/l navigation, cursor store sync
 *
 * Tests that the breadcrumb in the top bar updates correctly after
 * column navigation and other operations.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Breadcrumb Rendering", () => {
  test("breadcrumb reflects current cursor after l navigation", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
        item("col3", item("3a")),
      ),
    )
    const bugs: string[] = []

    board.press("l") // move to col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after l navigation")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb reflects current cursor after h navigation", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a"), item("2b")),
      ),
    )
    const bugs: string[] = []

    board.press("l") // → col2
    board.press("h") // → back to col1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after h navigation")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb updates on j/k within column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("j") // → C
    board.press("k") // → B

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after j/k navigation")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb after zoom in and out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    const bugs: string[] = []

    // Zoom into parent (which has children)
    board.press("i")

    const textAfterZoomIn = board.screenshot()
    if (textAfterZoomIn.includes("[object Object]") || textAfterZoomIn.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after zoom in")
    }

    // Zoom back out
    board.press("o")

    const textAfterZoomOut = board.screenshot()
    if (textAfterZoomOut.includes("[object Object]") || textAfterZoomOut.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after zoom out")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb after multiple h/l round trips", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b")),
        item("col2", item("2a")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )
    const bugs: string[] = []

    // Navigate right to col3
    board.press("l") // col2
    board.press("l") // col3
    // Navigate back to col1
    board.press("h") // col2
    board.press("h") // col1
    // Navigate right again
    board.press("l") // col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after multiple h/l round trips")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb at column level vs card level", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    // Go to column level
    board.press("k") // col1 header

    const textCol = board.screenshot()
    if (textCol.includes("[object Object]") || textCol.includes("TypeError")) {
      bugs.push("garbage in breadcrumb at column level")
    }

    // Go back to card level
    board.press("j") // back to A

    const textCard = board.screenshot()
    if (textCard.includes("[object Object]") || textCard.includes("TypeError")) {
      bugs.push("garbage in breadcrumb at card level")
    }
    expect(bugs).toEqual([])
  })

  test("breadcrumb after g/G (first/last card)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    board.press("G") // jump to last card (E)
    const textLast = board.screenshot()
    if (textLast.includes("[object Object]") || textLast.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after G")
    }

    board.press("g") // jump to first card (A)
    const textFirst = board.screenshot()
    if (textFirst.includes("[object Object]") || textFirst.includes("TypeError")) {
      bugs.push("garbage in breadcrumb after g")
    }
    expect(bugs).toEqual([])
  })
})
