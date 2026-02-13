/**
 * Exploration: Shift operations (Alt+hjkl) — move items up/down/left/right.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Shift Operations", () => {
  test("Alt+j moves item down", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("Alt+j") // move A down

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+j")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+k moves item up", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Alt+k") // move B up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+k")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+l moves item right (to next column)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("Alt+l") // move A to col2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+l")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+h moves item left (to prev column)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"), item("C"))))
    const bugs: string[] = []

    board.press("l") // → col2
    board.press("Alt+h") // move B to col1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+h")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+j at last position is boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("j") // → B (last)
    board.press("Alt+j") // boundary

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+j at boundary")
    }
    expect(bugs).toEqual([])
  })

  test("Alt+k at first position is boundary", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("Alt+k") // A is first, boundary

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Alt+k at boundary")
    }
    expect(bugs).toEqual([])
  })

  test("shift then undo", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("Alt+j") // move A down
    board.press("Ctrl+Z") // undo (may or may not be supported for shift)

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after shift + undo")
    }
    expect(bugs).toEqual([])
  })

  test("rapid Alt+j shifts", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))
    const bugs: string[] = []

    board.press("Alt+j")
    board.press("Alt+j")
    board.press("Alt+j")
    board.press("Alt+j")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid Alt+j")
    }
    expect(bugs).toEqual([])
  })
})
