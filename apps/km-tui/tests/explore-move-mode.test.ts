/**
 * Exploration: Move mode (m key) — enter move mode, navigate target, confirm/cancel.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Move Mode", () => {
  test("m enters move mode without crash", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("m") // enter move mode

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after entering move mode")
    }
    expect(bugs).toEqual([])
  })

  test("m then navigate then Enter confirms move", () => {
    const { board, repo } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("m") // move A
    board.press("l") // target col2
    board.press("Enter") // confirm

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after move confirm")
    }
    expect(bugs).toEqual([])
  })

  test("m then Escape cancels move", () => {
    const { board, repo } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C")),
      ),
    )
    const bugs: string[] = []

    const beforeCol1 = childIds(repo, "col1")

    board.press("m") // enter move mode
    board.press("l") // navigate to target
    board.press("Escape") // cancel

    const afterCol1 = childIds(repo, "col1")
    if (beforeCol1.join(",") !== afterCol1.join(",")) {
      bugs.push(`move cancel changed children: ${beforeCol1.join(",")} → ${afterCol1.join(",")}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after move cancel")
    }
    expect(bugs).toEqual([])
  })

  test("move mode navigation j/k", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B"), item("C")),
        item("col2", item("D"), item("E")),
      ),
    )
    const bugs: string[] = []

    board.press("m") // move A
    board.press("j") // down in target view
    board.press("j") // down more
    board.press("k") // up

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage during move mode navigation")
    }
    expect(bugs).toEqual([])
  })

  test("move mode with selection", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B"), item("C")),
        item("col2", item("D")),
      ),
    )
    const bugs: string[] = []

    // Select A→B then move
    board.press("J") // select A→B
    board.press("m") // move selected

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + move mode")
    }
    expect(bugs).toEqual([])
  })

  test("move mode then help overlay", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("m") // move mode
    board.press("?") // help — should not work in move mode

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after move mode + help")
    }

    board.press("Escape") // exit whatever state we're in

    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage after escaping move mode + help")
    }
    expect(bugs).toEqual([])
  })
})
