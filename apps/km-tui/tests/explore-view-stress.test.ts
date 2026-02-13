/**
 * Exploration: View mode stress — rapid view switching, operations in different views,
 * state preservation across view changes.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: View Mode Stress", () => {
  test("rapid view cycling 1→2→3→4→1", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("2") // columns
    board.press("3") // list
    board.press("4") // tabs
    board.press("1") // cards

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid view cycling")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate in list view then switch to cards", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))), { viewMode: "list" })
    const bugs: string[] = []

    board.press("d") // dup in list view
    board.press("1") // switch to cards

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after list dup + cards switch")
    }
    expect(bugs).toEqual([])
  })

  test("delete in columns view", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("2") // columns view
    board.press("Backspace") // delete

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete in columns view")
    }
    expect(bugs).toEqual([])
  })

  test("fold in list view", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))), {
      viewMode: "list",
    })
    const bugs: string[] = []

    board.press("z").press("a") // fold

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold in list view")
    }
    expect(bugs).toEqual([])
  })

  test("selection in tabs view", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("4") // tabs view
    board.press("j")
    board.press("J") // try selection in tabs

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection in tabs view")
    }
    expect(bugs).toEqual([])
  })

  test("v key cycles through all view modes", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    for (let i = 0; i < 5; i++) {
      board.press("v") // cycle view
      const text = board.screenshot()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push(`garbage after v press ${i + 1}`)
      }
    }
    expect(bugs).toEqual([])
  })

  test("navigate in each view mode", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"), item("E"))),
    )
    const bugs: string[] = []

    const views = ["1", "2", "3", "4"]
    for (const view of views) {
      board.press(view)
      board.press("j")
      board.press("k")
      board.press("l")
      board.press("h")
      const text = board.screenshot()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push(`garbage in view ${view} during navigation`)
      }
    }
    expect(bugs).toEqual([])
  })

  test("undo after view mode change", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // dup in cards view
    board.press("3") // switch to list view
    board.press("Ctrl+Z") // undo in list view

    const kids = childIds(repo, "col1")
    if (kids.length !== 2) {
      bugs.push(`expected 2 after undo in different view, got ${kids.length}`)
    }

    board.press("1") // back to cards
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo in list view + switch back")
    }
    expect(bugs).toEqual([])
  })
})
