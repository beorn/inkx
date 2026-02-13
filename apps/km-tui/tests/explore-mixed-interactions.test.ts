/**
 * Exploration: Mixed interactions — combinations of recent features
 *
 * Tests complex sequences that combine multiple focus areas:
 * detail pane + navigation, batch ops + indent, column delete + cursor, etc.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

function setTaskStatus(repo: { updateNode(id: string, updates: Record<string, unknown>): void }, ids: string[]) {
  for (const id of ids) {
    repo.updateNode(id, { task_status: "todo", task_mark: " " })
  }
}

describe("Exploration: Mixed Interactions", () => {
  test("detail pane then batch select then toggle", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    setTaskStatus(repo, ["A", "B", "C", "D"])
    const bugs: string[] = []

    // Open detail pane
    board.press("i")
    // Close it
    board.press("Escape")

    // Now batch select and toggle
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C
    board.press("x") // batch toggle

    const aStatus = repo.getNode("A")?.task_status
    if (aStatus === "todo") {
      bugs.push("batch toggle after detail pane didn't work")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in mixed detail+batch interaction")
    }
    expect(bugs).toEqual([])
  })

  test("indent then select then delete", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Indent E under D
    board.press("j").press("j").press("j").press("j") // → E
    board.press("Tab")
    expect(childIds(repo, "D")).toContain("E")

    // Navigate to B, select B→C
    board.press("k").press("k") // should be around B
    board.press("J") // start selection

    // Delete selected
    board.press("Backspace")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after indent+select+delete")
    }
    expect(bugs).toEqual([])
  })

  test("column indent then card operations", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Indent col2 under col1
    board.press("k") // col1 header
    board.press("l") // col2 header
    board.press("Tab") // indent col2 under col1

    // Navigate back to card level
    board.press("j") // down to a card

    // Try navigation
    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column indent + card nav")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in, navigate, zoom out, detail pane", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    const bugs: string[] = []

    // Zoom into parent
    board.press("i")
    // Navigate children
    board.press("j")
    board.press("k")
    // Zoom out
    board.press("o")
    // Open detail pane on leaf
    board.press("j") // → B
    board.press("i") // B is leaf, opens detail pane

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom cycle + detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("g/G navigation then batch delete", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Jump to last
    board.press("G") // → E
    // Select upwards
    board.press("K") // anchor=E, cursor→D
    board.press("K") // range E→C

    board.press("Backspace") // delete C, D, E

    const kids = childIds(repo, "col1")
    expect(kids).toEqual(["A", "B"])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after G+select+delete")
    }
    expect(bugs).toEqual([])
  })

  test("column delete then card navigation in remaining column", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Navigate to col1 header and delete
    board.press("k") // col1 header
    board.press("Backspace")
    board.press("Enter") // confirm

    // Navigate in remaining columns
    board.press("j")
    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after column delete + card navigation")
    }
    expect(bugs).toEqual([])
  })

  test("multiple view modes with indent", () => {
    for (const viewMode of ["cards", "columns", "list"] as const) {
      const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), { viewMode })
      const bugs: string[] = []

      board.press("j") // → B
      board.press("Tab") // indent B under A

      expect(childIds(repo, "A")).toContain("B")

      const text = board.screenshot()
      if (text.includes("[object Object]") || text.includes("TypeError")) {
        bugs.push(`garbage in ${viewMode} view indent`)
      }
      expect(bugs).toEqual([])
    }
  })

  test("h/l boundary navigation: h at leftmost, l at rightmost", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
    )
    const bugs: string[] = []

    // Try h at leftmost column (should bell or be no-op)
    board.press("h")

    // Navigate to rightmost
    board.press("l") // col2
    board.press("l") // col3

    // Try l at rightmost (should bell or be no-op)
    board.press("l")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage at h/l boundaries")
    }
    expect(bugs).toEqual([])
  })

  test("fold then indent", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("target"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("z").press("a") // toggle fold

    // Navigate to target
    board.press("j") // → target

    // Indent target under parent (folded)
    board.press("Tab")

    const parentKids = childIds(repo, "parent")
    if (!parentKids.includes("target")) {
      bugs.push("indent under folded parent failed")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold+indent")
    }
    expect(bugs).toEqual([])
  })

  test("batch operations on wide board", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("A1"), item("A2"), item("A3")),
          item("col2", item("B1"), item("B2"), item("B3")),
          item("col3", item("C1"), item("C2"), item("C3")),
        ),
      { columns: 120 },
    )
    setTaskStatus(repo, ["A1", "A2", "A3"])
    const bugs: string[] = []

    // Select and toggle in col1
    board.press("J") // anchor=A1, cursor→A2
    board.press("x") // batch toggle

    // Navigate to col2
    board.press("Escape") // clear selection
    board.press("l") // → col2

    // Select in col2
    board.press("J") // anchor=B1, cursor→B2
    board.press("Backspace") // delete B1, B2

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch ops across columns")
    }
    expect(bugs).toEqual([])
  })

  test("rapid key sequences don't accumulate errors", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Rapid navigation
    const keys = [
      "j",
      "j",
      "k",
      "l",
      "j",
      "h",
      "j",
      "k",
      "k",
      "l",
      "l",
      "h",
      "g",
      "G",
      "j",
      "k",
      "h",
      "l",
      "j",
      "j",
      "k",
      "g",
    ]
    for (const key of keys) {
      board.press(key)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid key sequences")
    }
    expect(bugs).toEqual([])
  })
})
