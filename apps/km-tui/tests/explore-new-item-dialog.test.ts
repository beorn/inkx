/**
 * Exploration: New item dialog (n key / gn chord) — open, interact, close.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: New Item Dialog", () => {
  test("n opens new item dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("n") // open new item dialog

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after opening new item dialog")
    }
    expect(bugs).toEqual([])
  })

  test("n then Escape closes dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("n") // open
    board.press("Escape") // close

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after new item dialog cancel")
    }
    expect(bugs).toEqual([])
  })

  test("gn chord opens new item dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))
    const bugs: string[] = []

    board.press("g").press("n") // chord

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after gn chord for new item")
    }
    expect(bugs).toEqual([])
  })

  test("n on empty column", () => {
    const { board } = testEnv(() => item("board", item("col1")))
    const bugs: string[] = []

    board.press("n") // new item on empty board

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after n on empty column")
    }
    expect(bugs).toEqual([])
  })

  test("new item dialog then navigation keys", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("n") // open dialog
    // Nav keys should NOT navigate while dialog is open
    board.press("j")
    board.press("k")
    board.press("h")
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after nav keys in new item dialog")
    }
    expect(bugs).toEqual([])
  })

  test("rapid open/close new item dialog", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) {
      board.press("n")
      board.press("Escape")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid new item dialog toggles")
    }
    expect(bugs).toEqual([])
  })
})
