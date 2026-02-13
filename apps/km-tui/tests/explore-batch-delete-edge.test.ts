/**
 * Exploration: Batch delete edge cases — what happens with various delete patterns
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Batch Delete Edge Cases", () => {
  test("delete single card with children shows confirm", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )
    const bugs: string[] = []

    // Delete parent (has children) — should show confirm
    board.press("Backspace")

    // Parent should still exist (waiting for confirm)
    expect(childIds(repo, "col1")).toContain("parent")

    // Confirm
    board.press("Enter")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after confirmed delete with children")
    }
    expect(bugs).toEqual([])
  })

  test("delete then undo attempt (no actual undo, just navigation)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("j") // → B
    board.press("Backspace") // delete B

    expect(childIds(repo, "col1")).toEqual(["A", "C"])

    // Navigate after delete
    board.press("j") // should move to C or stay on A
    board.press("k") // back

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after delete + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("delete all cards in column leaves empty column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const bugs: string[] = []

    // Delete the only card in col1
    board.press("Backspace")

    // col1 should be empty now
    expect(childIds(repo, "col1")).toEqual([])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after deleting last card in column")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete with confirm cancel preserves all", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A", item("child")), item("B"), item("C"))))
    const bugs: string[] = []

    // Select A→B (A has children → will show confirm)
    board.press("J") // anchor=A, cursor→B
    board.press("J") // range A→C

    board.press("Backspace") // triggers confirm
    board.press("Escape") // cancel

    // All should still exist
    expect(childIds(repo, "col1")).toContain("A")
    expect(childIds(repo, "col1")).toContain("B")
    expect(childIds(repo, "col1")).toContain("C")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete cancel")
    }
    expect(bugs).toEqual([])
  })

  test("delete interleaved with navigation", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )
    const bugs: string[] = []

    // Delete B
    board.press("j") // → B
    board.press("Backspace")
    expect(childIds(repo, "col1")).toEqual(["A", "C", "D", "E"])

    // Navigate and delete D
    board.press("j") // → D (C is now at index 1, D at index 2)
    board.press("Backspace")
    expect(childIds(repo, "col1")).toEqual(["A", "C", "E"])

    // Navigate and delete E
    board.press("j") // → E
    board.press("Backspace")
    expect(childIds(repo, "col1")).toEqual(["A", "C"])

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after interleaved delete + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("batch select all, cancel confirm, then single delete", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A", item("child")), item("B"), item("C"))))
    const bugs: string[] = []

    // Select all and try batch delete
    board.press("J")
    board.press("J")
    board.press("Backspace") // confirm dialog
    board.press("Escape") // cancel

    // Now try single delete on current position
    board.press("Backspace")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after cancel batch + single delete")
    }
    expect(bugs).toEqual([])
  })
})
