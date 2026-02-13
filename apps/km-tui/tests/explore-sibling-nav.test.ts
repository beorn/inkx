/**
 * Exploration: Sibling board navigation (Ctrl+J/K) and history navigation ([/]).
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Sibling/History Navigation", () => {
  test("history back/forward on single board does not crash", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("[") // history back — no history
    board.press("]") // history forward — no history

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after history nav on single board")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in creates history, [ goes back", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom into parent (or open detail if leaf)
    board.press("[") // go back

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom + history back")
    }
    expect(bugs).toEqual([])
  })

  test("Ctrl+J/K sibling nav at root level", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Ctrl+J") // sibling board down (if any)
    board.press("Ctrl+K") // sibling board up (if any)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Ctrl+J/K")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then out preserves cursor", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    // e zooms to cursor (zoom-to)
    board.press("e")
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom in/out")
    }
    expect(bugs).toEqual([])
  })

  test("Shift+1 through Shift+3 jumps to columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
    )
    const bugs: string[] = []

    board.press("!") // Shift+1 → col1
    board.press("@") // Shift+2 → col2
    board.press("#") // Shift+3 → col3

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Shift+number jumps")
    }
    expect(bugs).toEqual([])
  })

  test("page down then page up", () => {
    const { board } = testEnv(() => {
      const items = Array.from({ length: 15 }, (_, i) => item(`t${i + 1}`))
      return item("board", item("col1", ...items))
    })
    const bugs: string[] = []

    board.press("Ctrl+D") // page down
    board.press("Ctrl+D") // page down again
    board.press("Ctrl+U") // page up
    board.press("Ctrl+U") // page up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after page nav")
    }
    expect(bugs).toEqual([])
  })
})
