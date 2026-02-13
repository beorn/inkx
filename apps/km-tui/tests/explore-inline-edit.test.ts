/**
 * Exploration: Inline editing (Enter to edit title) — interaction with other features.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Inline Edit", () => {
  test("Enter opens inline edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Enter") // edit A title

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Enter for inline edit")
    }
    expect(bugs).toEqual([])
  })

  test("Enter then Escape cancels edit", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Enter") // edit
    board.press("Escape") // cancel

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after edit cancel")
    }
    expect(bugs).toEqual([])
  })

  test("Enter then type then Enter saves", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Enter") // edit
    // Type something (this uses the line-edit system)
    board.press("Enter") // save (or cancel empty change)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after edit save")
    }
    expect(bugs).toEqual([])
  })

  test("inline edit then navigation after", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("Enter") // edit
    board.press("Escape") // cancel
    board.press("j") // navigate down
    board.press("j") // navigate down

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after edit cancel + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("Enter on column header", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const bugs: string[] = []

    // Navigate up to column level (press k past first card)
    board.press("k") // column level
    board.press("Enter") // try editing column header

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Enter on column header")
    }
    expect(bugs).toEqual([])
  })

  test("inline edit on folded node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("z").press("a") // fold parent
    board.press("Enter") // edit folded parent title

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Enter on folded node")
    }
    board.press("Escape")
    expect(bugs).toEqual([])
  })
})
