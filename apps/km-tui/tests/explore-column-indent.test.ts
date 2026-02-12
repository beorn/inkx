/**
 * Exploration: Column indent (Tab on column header) and column outdent (Shift-Tab)
 *
 * Tests Tab/Shift-Tab at column level for structural operations.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Column Indent/Outdent", () => {
  test("Tab on column header indents column under previous", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Navigate to col2 header
    board.press("k") // col1 header
    board.press("l") // col2 header
    board.expect("#col2[data-cursor]").toExist()

    board.press("Tab") // indent col2 under col1

    const col1Kids = childIds(repo, "col1")
    if (!col1Kids.includes("col2")) {
      bugs.push("col2 not indented under col1")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column indent")
    }
    expect(bugs).toEqual([])
  })

  test("Tab on first column header is blocked", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    const bugs: string[] = []

    // Navigate to col1 header
    board.press("k") // col1 header
    board.expect("#col1[data-cursor]").toExist()

    board.press("Tab") // try indent — should be blocked

    // col1 should still be top-level
    const boardKids = childIds(repo, "board")
    if (!boardKids.includes("col1")) {
      bugs.push("first column was incorrectly indented")
    }

    expect(bugs).toEqual([])
  })

  test("Shift-Tab on column header outdents to board level", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B"))),
    )
    const bugs: string[] = []

    // Navigate to col2 header, indent it first
    board.press("k") // col1 header
    board.press("l") // col2 header
    board.press("Tab") // col2 under col1

    // Now outdent col2 back
    board.press("Shift+Tab")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column outdent")
    }
    expect(bugs).toEqual([])
  })

  test("Tab on third column with two preceding", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("B")), item("col3", item("C"))),
    )
    const bugs: string[] = []

    // Navigate to col3 header
    board.press("k") // col1 header
    board.press("l") // col2 header
    board.press("l") // col3 header

    board.press("Tab") // indent col3 under col2

    const col2Kids = childIds(repo, "col2")
    if (!col2Kids.includes("col3")) {
      bugs.push("col3 not indented under col2")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indenting third column")
    }
    expect(bugs).toEqual([])
  })

  test("column indent preserves children of indented column", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A")), item("col2", item("X"), item("Y"), item("Z"))),
    )
    const bugs: string[] = []

    board.press("k") // col1 header
    board.press("l") // col2 header
    board.press("Tab") // indent col2 under col1

    // col2's children should still be intact
    const col2Kids = childIds(repo, "col2")
    if (!col2Kids.includes("X") || !col2Kids.includes("Y") || !col2Kids.includes("Z")) {
      bugs.push("col2 children lost after column indent")
    }

    expect(bugs).toEqual([])
  })

  test("column indent then navigate back to card level", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    // Indent col2 under col1
    board.press("k") // col1 header
    board.press("l") // col2 header
    board.press("Tab")

    // Navigate back down to card level
    board.press("j") // should go to a card

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column indent + navigate to card")
    }
    expect(bugs).toEqual([])
  })
})
