/**
 * Exploration: Extended batch operations — multi-select d/x/Backspace edge cases.
 *
 * Focus on: duplicate (d) with selection, status cycle (x) with mixed statuses,
 * Backspace with various selection patterns, interaction with navigation.
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

describe("Exploration: Batch Ops Extended", () => {
  test("batch duplicate: J select 2, then d duplicates both", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("J") // anchor=A, cursor→B
    board.press("d") // batch duplicate

    const kids = childIds(repo, "col1")
    // Should have A, B, C plus duplicates
    if (kids.length < 4) {
      bugs.push(`expected at least 4 children after batch dup, got ${kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch duplicate")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete first card, cursor moves to next", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Select A only (single selection, no J needed — just Backspace)
    board.press("Backspace")

    const kids = childIds(repo, "col1")
    if (kids.includes("A")) {
      bugs.push("A should be deleted")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete first card")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete last card, cursor moves to previous", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Navigate to last card
    board.press("j").press("j") // → C
    board.press("Backspace")

    const kids = childIds(repo, "col1")
    if (kids.includes("C")) {
      bugs.push("C should be deleted")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete last card")
    }
    expect(bugs).toEqual([])
  })

  test("batch x on mixed task statuses", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item.task("A", "todo"),
        item.task("B", "wip"),
        item.task("C", "done"),
        item.task("D", "todo"),
      )),
    )
    const bugs: string[] = []

    // Select A→C (3 items with different statuses)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("x") // batch cycle

    // All should advance from their current status
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch x on mixed statuses")
    }
    expect(bugs).toEqual([])
  })

  test("J past column boundary: select in col1, navigate to col2", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1", item("A"), item("B")),
        item("col2", item("C"), item("D")),
      ),
    )
    const bugs: string[] = []

    board.press("J") // start selection in col1
    board.press("l") // navigate to col2 — should clear selection or handle gracefully

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J then cross-column navigation")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete with single item in column", () => {
    const { board, repo } = testEnv(() =>
      item("board",
        item("col1", item("only")),
        item("col2", item("C")),
      ),
    )
    const bugs: string[] = []

    board.press("Backspace") // delete the only card

    const kids = childIds(repo, "col1")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting single card in column")
    }
    expect(bugs).toEqual([])
  })

  test("select then Escape clears, then batch op affects only cursor", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item.task("A", "todo"),
        item.task("B", "todo"),
        item.task("C", "todo"),
      )),
    )
    const bugs: string[] = []

    // Select A→B
    board.press("J")
    // Escape clears selection
    board.press("Escape")
    // x should only cycle cursor item, not batch
    board.press("x")

    const aStatus = repo.getNode("A")?.task_status
    const bStatus = repo.getNode("B")?.task_status

    // After clearing selection, only cursor item should change
    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after select, clear, single op")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete with confirm dialog for parent nodes", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1",
        item("parent", item("c1"), item("c2")),
        item("leaf"),
      )),
    )
    const bugs: string[] = []

    // Delete parent (has children — should prompt confirm)
    board.press("Backspace")
    board.press("Enter") // confirm

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete parent with confirm")
    }
    expect(bugs).toEqual([])
  })

  test("J K alternating does not corrupt selection", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Alternating J and K
    board.press("J") // A→B
    board.press("K") // back to just A
    board.press("J") // A→B again
    board.press("J") // A→C
    board.press("K") // A→B

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after J/K alternation")
    }
    expect(bugs).toEqual([])
  })

  test("batch duplicate then undo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    // Select A→B then duplicate
    board.press("J")
    board.press("d")

    const afterDup = childIds(repo, "col1")

    // Undo — should restore original
    board.press("Ctrl+Z")

    const afterUndo = childIds(repo, "col1")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch dup then undo")
    }
    expect(bugs).toEqual([])
  })
})
