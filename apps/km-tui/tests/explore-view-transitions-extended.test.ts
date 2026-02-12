/**
 * Exploration: Extended view transitions — switching views while in various states
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: View Transitions Extended", () => {
  test("cards → columns → list → cards cycle", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    // v toggles between views (1=cards, 2=columns, 3=list, 4=tabs)
    board.press("2") // columns
    const t1 = board.screenshot()
    if (t1.includes("[object Object]") || t1.includes("TypeError")) {
      bugs.push("garbage after switch to columns")
    }

    board.press("3") // list
    const t2 = board.screenshot()
    if (t2.includes("[object Object]") || t2.includes("TypeError")) {
      bugs.push("garbage after switch to list")
    }

    board.press("1") // cards
    const t3 = board.screenshot()
    if (t3.includes("[object Object]") || t3.includes("TypeError")) {
      bugs.push("garbage after switch back to cards")
    }

    expect(bugs).toEqual([])
  })

  test("navigation after view switch", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"))),
    )
    const bugs: string[] = []

    // Navigate in cards view
    board.press("j")
    board.press("l")

    // Switch to list
    board.press("3")

    // Navigate in list view
    board.press("j")
    board.press("k")
    board.press("h")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after navigation in different view modes")
    }
    expect(bugs).toEqual([])
  })

  test("indent in list view then switch to cards", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
      { viewMode: "list" },
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Tab") // indent B under A

    expect(childIds(repo, "A")).toContain("B")

    // Switch to cards view
    board.press("1")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indent in list then switch to cards")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane in cards then switch to columns", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    // Open detail pane in cards view
    board.press("i")

    // Switch to columns view — should close detail or adapt
    board.press("2")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane + view switch")
    }
    expect(bugs).toEqual([])
  })

  test("selection in cards then switch to list", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Start selection in cards
    board.press("J") // anchor=A, cursor→B

    // Switch to list view — selection should clear or transfer
    board.press("3")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + view switch")
    }
    expect(bugs).toEqual([])
  })

  test("tabs view rendering", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C")), item("col3", item("D"))),
    )
    const bugs: string[] = []

    board.press("4") // switch to tabs view

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in tabs view")
    }

    // Navigate in tabs view
    board.press("l") // next tab
    board.press("j") // navigate cards
    board.press("h") // prev tab

    const text2 = board.screenshot()
    if (text2.includes("[object Object]") || text2.includes("TypeError")) {
      bugs.push("garbage after navigation in tabs view")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then switch view mode then zoom out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    // Zoom into parent
    board.press("i")

    // Switch view mode while zoomed
    board.press("2") // columns

    // Zoom out
    board.press("o")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom + view switch + zoom out")
    }
    expect(bugs).toEqual([])
  })
})
