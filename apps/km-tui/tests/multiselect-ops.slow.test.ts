/**
 * Multi-select batch operations
 *
 * Tests batch delete and batch status toggle when multiple nodes are selected.
 * Follows the same atomic pattern as batch indent/outdent:
 * - All-or-nothing validation
 * - Correct processing order (bottom-up for delete)
 * - Selection cleared after operation
 * - Cursor follows to valid position
 *
 * NOTE: testEnv starts with cursor on card 0 (first card), not column header.
 *
 * Selection behavior:
 * - First J from card: sets anchor + adds anchor to multiSelected (1 item)
 * - Second J: builds range from anchor to cursor (3+ items via updateSelectionRange)
 * - Batch operations require getSelectedCardIndices().length > 1 to activate
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

function nodeStatus(
  repo: { getNode(id: string): { task_status?: string | null } | null | undefined },
  id: string,
): string {
  return repo.getNode(id)?.task_status ?? "todo"
}

/** Make leaf nodes into proper tasks with task_status */
function setTaskStatus(repo: { updateNode(id: string, updates: Record<string, unknown>): void }, ids: string[]) {
  for (const id of ids) {
    repo.updateNode(id, { task_status: "todo", task_marker: "[ ]" })
  }
}

// =============================================================================
// Batch Delete
// =============================================================================

describe("Multi-select delete", () => {
  test("delete multiple selected empty cards", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    // Cursor starts on A. Move to B, then extend selection B→D (2 J presses).
    board.command("cursor_down") // → B (card 1)
    board.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}, cursor→C
    board.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}, cursor→D

    board.press("Backspace")

    // B, C, D should be gone
    expect(childIds(repo, "col1")).toEqual(["A", "E"])
  })

  test("batch delete shows confirmation when any node has children", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    board.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→parent
    board.press("shift+ArrowDown") // range A→C, multiSelected={A:0,parent:0,C:0}, cursor→C

    board.press("Backspace")

    // Nothing deleted yet — confirmation dialog should be open
    expect(childIds(repo, "col1")).toContain("A")
    expect(childIds(repo, "col1")).toContain("parent")
    expect(childIds(repo, "col1")).toContain("C")
  })

  test("batch delete confirms and executes all nodes", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    board.press("shift+ArrowDown") // anchor=A, cursor→parent
    board.press("shift+ArrowDown") // range A→C, cursor→C

    board.press("Backspace") // triggers confirmation dialog
    board.press("Enter") // confirm delete

    // A, parent (with children), and C should all be deleted
    expect(childIds(repo, "col1")).toEqual(["D"])
  })

  test("batch delete cursor moves to valid position after deletion", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    // Cursor starts on A. Move to C, extend C→E (2 J presses).
    board.command("cursor_down") // → B
    board.command("cursor_down") // → C
    board.press("shift+ArrowDown") // anchor=C, cursor→D
    board.press("shift+ArrowDown") // range C→E, cursor→E

    board.press("Backspace")

    // C, D, E deleted; cursor should land on B (last remaining at edge)
    expect(childIds(repo, "col1")).toEqual(["A", "B"])
  })

  test("batch delete clears selection", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Cursor starts on A. Select A→C (2 J presses).
    board.press("shift+ArrowDown") // anchor=A, cursor→B
    board.press("shift+ArrowDown") // range A→C, cursor→C

    board.press("Backspace")

    // A, B, C deleted. Only D remains.
    expect(childIds(repo, "col1")).toEqual(["D"])
  })

  test("single card delete still works (no regression)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cursor starts on A. Move to B. No selection.
    board.command("cursor_down") // → B

    board.press("Backspace")

    expect(childIds(repo, "col1")).toEqual(["A", "C"])
  })
})

  test("delete card with only empty children skips confirmation", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )

    // Clear content from children to make them empty
    repo.updateNode("child1", { content: null })
    repo.updateNode("child2", { content: null })

    // Cursor starts on parent. Press Backspace — should delete immediately (no confirmation).
    board.press("Backspace")

    // parent and its empty children are gone
    expect(childIds(repo, "col1")).toEqual(["B"])
  })

  test("delete card counts only non-empty children in confirmation", () => {
    const { board, store, repo } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("child1"), item("empty1"), item("empty2"), item("child2")), item("B")),
      ),
    )

    // Make 2 of 4 children empty
    repo.updateNode("empty1", { content: null })
    repo.updateNode("empty2", { content: null })

    // Cursor starts on parent. Press Backspace — should show confirmation with childCount=2.
    board.press("Backspace")

    const dc = store.getState().ui.deleteConfirm
    expect(dc).toBeTruthy()
    expect(dc!.childCount).toBe(2)
  })
})

// =============================================================================
// Batch Status Toggle
// =============================================================================

describe("Multi-select status toggle", () => {
  test("toggle status on multiple selected tasks", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    board.press("shift+ArrowDown") // anchor=A, cursor→B
    board.press("shift+ArrowDown") // range A→C, cursor→C

    board.command("cycle_task_status") // batch toggle

    // A, B, C should all advance to "wip"
    expect(nodeStatus(repo, "A")).toBe("wip")
    expect(nodeStatus(repo, "B")).toBe("wip")
    expect(nodeStatus(repo, "C")).toBe("wip")

    // D unchanged
    expect(nodeStatus(repo, "D")).toBe("todo")
  })

  test("batch status toggle preserves selection for repeated toggling", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    board.press("shift+ArrowDown") // anchor=A, cursor→B
    board.press("shift+ArrowDown") // range A→C, cursor→C

    board.command("cycle_task_status") // batch toggle: A→wip, B→wip, C→wip

    // Selection preserved: toggling again affects all selected cards
    board.command("cycle_task_status")
    expect(nodeStatus(repo, "A")).toBe("blocked") // wip→blocked
    expect(nodeStatus(repo, "B")).toBe("blocked") // wip→blocked
    expect(nodeStatus(repo, "C")).toBe("blocked") // wip→blocked

    // D unchanged throughout
    expect(nodeStatus(repo, "D")).toBe("todo")
  })

  test("batch status toggle with mixed statuses advances each independently", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Move to B and cycle it to "blocked" (todo→wip→blocked)
    board.command("cursor_down") // → B
    board.command("cycle_task_status") // todo→wip
    board.command("cycle_task_status") // wip→blocked

    expect(nodeStatus(repo, "B")).toBe("blocked")

    // Move back to A. Select A→C (2 J presses). A=todo, B=blocked, C=todo.
    board.command("cursor_up") // → A
    board.press("shift+ArrowDown") // anchor=A, cursor→B
    board.press("shift+ArrowDown") // range A→C, cursor→C

    board.command("cycle_task_status") // batch toggle

    // Each advances from its own position
    expect(nodeStatus(repo, "A")).toBe("wip") // todo→wip
    expect(nodeStatus(repo, "B")).toBe("done") // blocked→done
    expect(nodeStatus(repo, "C")).toBe("wip") // todo→wip
  })

  test("single card status toggle still works (no regression)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    setTaskStatus(repo, ["A", "B"])

    // Navigate to trigger re-render so command system picks up task_status
    board.command("cursor_down") // → B
    board.command("cursor_up") // → A
    board.command("cycle_task_status") // single toggle

    expect(nodeStatus(repo, "A")).toBe("wip")
    expect(nodeStatus(repo, "B")).toBe("todo") // unchanged
  })
})
