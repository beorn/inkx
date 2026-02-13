/**
 * Bug: km-wacsx — Redo (Ctrl+Y) does not restore duplicated node after undo
 *
 * After duplicating a node (d) and undoing (Ctrl+Z), pressing Ctrl+Y to redo
 * does nothing — the duplicate is not re-added. The undo stack's redo closure
 * calls `repo.addNode(parentId, { ...newNode, id: newId })` but the node does
 * not reappear.
 *
 * Key sequence: d, Ctrl+Z, Ctrl+Y
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("redo-duplicate-broken (km-wacsx)", () => {
  test("redo after undo restores the duplicated node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )

    // Baseline: 2 children
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["A", "B"])

    // Duplicate A -> 3 children
    board.press("d")
    expect(repo.getChildren("col1")).toHaveLength(3)

    // Undo -> back to 2
    board.press("Ctrl+Z")
    expect(repo.getChildren("col1")).toHaveLength(2)

    // Redo -> should be back to 3
    board.press("Ctrl+Y")
    expect(repo.getChildren("col1")).toHaveLength(3)
  })

  test("rapid undo/redo cycle preserves duplicate", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )

    board.press("d")        // dup -> 3
    board.press("Ctrl+Z")   // undo -> 2
    board.press("Ctrl+Y")   // redo -> 3
    board.press("Ctrl+Z")   // undo -> 2
    board.press("Ctrl+Y")   // redo -> 3

    expect(repo.getChildren("col1")).toHaveLength(3)
  })
})
