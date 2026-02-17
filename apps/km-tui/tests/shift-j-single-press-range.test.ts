/**
 * Bug km-cnn5z: Shift-J single press selects only 1 item, batch ops skip anchor
 *
 * After pressing J once from card A:
 * - Anchor is set to A, cursor moves to B
 * - The visual range A→B should contain 2 items (both A and B)
 * - Batch operations (x toggle, Backspace) should affect both nodes
 *
 * Actual: multiSelected contains only 1 item (the anchor A).
 * getSelectedCardIndices returns [0] (1 index), so batch ops
 * fall through to single-node path and only operate on cursor (B).
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Shift-J single press range (km-cnn5z)", () => {
  function makeBoard() {
    return testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
  }

  test("single J from A selects both A and B", () => {
    const { board } = makeBoard()

    // Cursor starts on A (card 0)
    board.press("J") // anchor=A, cursor→B

    // After one J, the selection range should include both A and B
    // Check status message reflects 2 items selected
    const status = board.getStatus()
    expect(status).not.toBeNull()
    expect(status!.message).toContain("2")
  })

  test("batch toggle after single J affects both A and B", () => {
    const { board, repo } = makeBoard()

    // Make A and B proper tasks
    repo.updateNode("A", { task_status: "todo", task_marker: "[ ]" })
    repo.updateNode("B", { task_status: "todo", task_marker: "[ ]" })
    repo.updateNode("C", { task_status: "todo", task_marker: "[ ]" })

    // Re-render to pick up node type changes
    board.press("J") // anchor=A, cursor→B — should select range [A, B]

    // Toggle status on selection
    board.press("x")

    // Both A and B should have their status toggled (not just B)
    const statusA = repo.getNode("A")?.task_status
    const statusB = repo.getNode("B")?.task_status
    const statusC = repo.getNode("C")?.task_status

    // A and B should both be toggled away from "todo"
    expect(statusA).not.toBe("todo")
    expect(statusB).not.toBe("todo")
    // C should be untouched
    expect(statusC).toBe("todo")
  })

  test("batch delete after single J removes both A and B", () => {
    const { board, repo } = makeBoard()

    // Cursor on A, press J to select range A→B
    board.press("J")

    // Delete the selection
    board.press("Backspace")

    // Both A and B should be deleted, only C remains
    const children = repo.getChildren("col1").map((n) => n.id)
    expect(children).toEqual(["C"])
  })
})
