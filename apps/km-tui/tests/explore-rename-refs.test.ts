/**
 * Exploration: Rename refs — `sr` keybinding for rename with reference updates
 *
 * Tests the sr chord which triggers inline edit for renaming.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Rename Refs", () => {
  test("sr opens inline edit on current node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // sr chord: s then r
    board.press("s")
    board.press("r")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after sr chord")
    }
    expect(bugs).toEqual([])
  })

  test("sr on different cards", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("Alpha"), item("Beta"), item("Gamma"))),
    )
    const bugs: string[] = []

    // Navigate to Beta, then sr
    board.press("j") // → Beta
    board.press("s")
    board.press("r")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after sr on second card")
    }
    expect(bugs).toEqual([])
  })

  test("sr then Escape cancels rename", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("s")
    board.press("r")
    board.press("Escape") // cancel rename

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after canceling rename")
    }
    expect(bugs).toEqual([])
  })

  test("sr on column header", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    const bugs: string[] = []

    // Navigate to column header
    board.press("k") // col1 header

    board.press("s")
    board.press("r")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after sr on column header")
    }

    // Escape to close if edit is open
    board.press("Escape")
    expect(bugs).toEqual([])
  })

  test("Enter during inline edit doesn't crash", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    // Open inline edit via Enter key
    board.press("Enter")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Enter inline edit")
    }

    board.press("Escape")
    expect(bugs).toEqual([])
  })
})
