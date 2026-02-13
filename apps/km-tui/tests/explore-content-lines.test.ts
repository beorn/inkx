/**
 * Exploration: Content lines / body content display — +/- keys change
 * maxContentLines, interaction with fold and depth changes.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Content Lines", () => {
  test("+ increases content lines", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item("parent", item.paragraph("Some body text here that should show in content area"), item("child1")),
          item("B"),
        ),
      ),
    )
    const bugs: string[] = []

    board.press("+")
    board.press("+")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after + content lines")
    }
    expect(bugs).toEqual([])
  })

  test("- decreases content lines to 0", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item.paragraph("body text"), item("child1")), item("B"))),
    )
    const bugs: string[] = []

    board.press("-")
    board.press("-")
    board.press("-")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after - content lines to 0")
    }
    expect(bugs).toEqual([])
  })

  test("+ and - rapid toggling", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item.paragraph("body"), item("child")), item("B"))),
    )
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) {
      board.press("+")
      board.press("-")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after +/- toggling")
    }
    expect(bugs).toEqual([])
  })

  test("+ then < depth change", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item.paragraph("body text"), item("L2", item("deep"))), item("B"))),
    )
    const bugs: string[] = []

    board.press("+")
    board.press("+")
    board.press("<") // decrease depth

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after + then <")
    }
    expect(bugs).toEqual([])
  })

  test("+ then fold", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item.paragraph("body"), item("child")), item("B"))),
    )
    const bugs: string[] = []

    board.press("+")
    board.press("z").press("a") // fold

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after + then fold")
    }
    expect(bugs).toEqual([])
  })

  test("- at 0 then navigate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    // Press - enough to reach 0
    for (let i = 0; i < 5; i++) board.press("-")
    board.press("j")
    board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after - at 0 + nav")
    }
    expect(bugs).toEqual([])
  })
})
