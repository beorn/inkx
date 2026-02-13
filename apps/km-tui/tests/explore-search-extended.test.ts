/**
 * Exploration: Search dialog (/ key) — open, type, close, interaction with modes.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Search Dialog Extended", () => {
  test("/ opens search dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Alpha"), item("Beta"))))
    const bugs: string[] = []

    board.press("/") // open search

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after opening search dialog")
    }
    expect(bugs).toEqual([])
  })

  test("/ then Escape closes search", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Alpha"), item("Beta"))))
    const bugs: string[] = []

    board.press("/")
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after search cancel")
    }
    expect(bugs).toEqual([])
  })

  test("search then navigate after close", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Alpha"), item("Beta"), item("Charlie"))))
    const bugs: string[] = []

    board.press("/")
    board.press("Escape")
    board.press("j") // should navigate normally after search close
    board.press("j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after search close + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("search on empty column", () => {
    const { board } = testEnv(() => item("board", item("col1")))
    const bugs: string[] = []

    board.press("/")
    board.press("Escape")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after search on empty column")
    }
    expect(bugs).toEqual([])
  })

  test("rapid open/close search", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) {
      board.press("/")
      board.press("Escape")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid search toggles")
    }
    expect(bugs).toEqual([])
  })

  test("search then detail pane", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("/")
    board.press("Escape")
    board.press(" ") // open detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after search then detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane then search", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press(" ") // open detail pane
    board.press("/") // open search — should close detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane then search")
    }
    expect(bugs).toEqual([])
  })

  test("help overlay then search", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("?") // open help
    board.press("Escape") // close help
    board.press("/") // open search

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after help then search")
    }
    expect(bugs).toEqual([])
  })
})
