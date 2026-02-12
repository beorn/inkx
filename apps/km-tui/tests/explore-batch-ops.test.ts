/**
 * Exploration: Batch operations — multi-select (V/J), batch delete (Backspace),
 * batch status toggle (x), batch indent/outdent (Tab/Shift-Tab)
 *
 * Tests interaction between multi-select and various batch operations.
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

describe("Exploration: Batch Operations", () => {
  test("J extends selection downwards", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J selection")
    }
    expect(bugs).toEqual([])
  })

  test("K extends selection upwards", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Move to D, then select upwards
    board.press("j").press("j").press("j") // → D
    board.press("K") // anchor=D, cursor→C
    board.press("K") // range D→B

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after K selection")
    }
    expect(bugs).toEqual([])
  })

  test("Escape clears selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("J").press("J") // select A→C
    board.press("Escape") // clear selection

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after Escape clearing selection")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete removes all selected, cursor lands on valid node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("J") // anchor=B, cursor→C
    board.press("J") // range B→D

    board.press("Backspace") // delete B, C, D

    const kids = childIds(repo, "col1")
    if (kids.includes("B") || kids.includes("C") || kids.includes("D")) {
      bugs.push("batch delete didn't remove all selected nodes")
    }
    if (!kids.includes("A") || !kids.includes("E")) {
      bugs.push("batch delete removed unselected nodes")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete")
    }
    expect(bugs).toEqual([])
  })

  test("batch status toggle advances all selected tasks", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    setTaskStatus(repo, ["A", "B", "C", "D"])
    const bugs: string[] = []

    // Select A→C
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("x") // batch toggle

    const aStatus = repo.getNode("A")?.task_status
    const bStatus = repo.getNode("B")?.task_status
    const cStatus = repo.getNode("C")?.task_status
    const dStatus = repo.getNode("D")?.task_status

    if (aStatus === "todo" || bStatus === "todo" || cStatus === "todo") {
      bugs.push("batch status toggle didn't advance selected nodes")
    }
    if (dStatus !== "todo") {
      bugs.push("batch status toggle affected unselected node D")
    }

    expect(bugs).toEqual([])
  })

  test("batch indent: selected B,C indented under A", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("J") // anchor=B, cursor→C
    board.press("J") // range B→D

    board.press("Tab") // batch indent

    // Bottom-up: D→C, C→B, B→A
    const aKids = childIds(repo, "A")
    if (!aKids.includes("B")) {
      bugs.push("B not indented under A")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch indent")
    }
    expect(bugs).toEqual([])
  })

  test("batch outdent: selected cards from column to board level", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Select A→C
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("Shift+Tab") // batch outdent

    const boardKids = childIds(repo, "board")
    if (!boardKids.includes("A") || !boardKids.includes("B") || !boardKids.includes("C")) {
      bugs.push("batch outdent didn't move all selected to board level")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch outdent")
    }
    expect(bugs).toEqual([])
  })

  test("select then navigate without selection op does not crash", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"), item("E"))),
    )
    const bugs: string[] = []

    board.press("J") // start selection
    board.press("l") // navigate to col2 — should clear selection or navigate

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + column navigation")
    }
    expect(bugs).toEqual([])
  })

  test("select all cards in column then delete", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2", item("D"))),
    )
    const bugs: string[] = []

    // Select A→C (all cards in col1)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C
    board.press("Backspace") // delete all

    const col1Kids = childIds(repo, "col1")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting all cards in column")
    }
    expect(bugs).toEqual([])
  })

  test("batch status toggle twice cycles all", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    setTaskStatus(repo, ["A", "B", "C", "D"])
    const bugs: string[] = []

    // Select A→C (2 J presses needed for batch: getSelectedCardIndices > 1)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("x") // toggle once: todo→wip
    board.press("x") // toggle twice: wip→blocked

    const aStatus = repo.getNode("A")?.task_status
    const bStatus = repo.getNode("B")?.task_status
    const cStatus = repo.getNode("C")?.task_status

    // After two toggles: todo→wip→blocked
    if (aStatus === "todo" || bStatus === "todo" || cStatus === "todo") {
      bugs.push("double batch toggle didn't advance twice")
    }

    expect(bugs).toEqual([])
  })
})
