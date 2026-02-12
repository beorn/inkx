/**
 * Exploration: Fold interactions with other features — fold + delete, fold + indent,
 * fold + selection, fold + view switch
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Fold Interactions", () => {
  test("fold parent then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("z").press("a")

    // Navigate
    board.press("j") // → B (or next visible item)
    board.press("j") // → C
    board.press("k") // back

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("fold then unfold preserves tree", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2"), item("c3")), item("B"))),
    )
    const bugs: string[] = []

    // Fold
    board.press("z").press("a")
    // Unfold
    board.press("z").press("a")

    // Children should still be there
    expect(childIds(repo, "parent")).toEqual(["c1", "c2", "c3"])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold/unfold cycle")
    }
    expect(bugs).toEqual([])
  })

  test("fold then delete folded parent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("z").press("a")

    // Delete folded parent (has children — needs confirm)
    board.press("Backspace")
    board.press("Enter") // confirm

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting folded parent")
    }
    expect(bugs).toEqual([])
  })

  test("fold then select across folded node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("parent", item("c1"), item("c2")), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("j") // → parent
    board.press("z").press("a") // fold

    // Go back to A
    board.press("k")

    // Select A→C (spanning across folded parent)
    board.press("J") // anchor=A, cursor→parent
    board.press("J") // range → C

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage selecting across folded node")
    }
    expect(bugs).toEqual([])
  })

  test("fold + outdent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("z").press("a")

    // Outdent folded parent
    board.press("Shift+Tab")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after outdenting folded node")
    }
    expect(bugs).toEqual([])
  })

  test("fold then switch view mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    // Fold
    board.press("z").press("a")

    // Switch views
    board.press("2") // columns
    board.press("3") // list
    board.press("1") // back to cards

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold + view switch")
    }
    expect(bugs).toEqual([])
  })

  test("multiple folds then batch operations", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("p1", item("c1")),
        item("p2", item("c2")),
        item("p3", item("c3")),
        item("B"),
      )),
    )
    const bugs: string[] = []

    // Fold p1
    board.press("z").press("a")
    // Move to p2, fold
    board.press("j") // → p2
    board.press("z").press("a")
    // Move to p3, fold
    board.press("j") // → p3
    board.press("z").press("a")

    // Navigate back up
    board.press("k").press("k")

    // Select p1→p3
    board.press("J")
    board.press("J")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after multiple folds + selection")
    }
    expect(bugs).toEqual([])
  })
})
