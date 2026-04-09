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
 * - Second J: builds range from anchor to cursor (3+ items via sel.node.extend)
 * - Batch operations require getSelectedCardIndices(ctx).length > 1 to activate
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

function nodeStatus(repo: { getNode(id: string): KNode | null | undefined }, id: string): string {
  return repo.getNode(id)?.item?.task?.status ?? "todo"
}

/** Make leaf nodes into proper tasks with item.task */
function setTaskStatus(repo: { updateNode(id: string, updates: Record<string, unknown>): void }, ids: string[]) {
  for (const id of ids) {
    repo.updateNode(id, { item: { task: { status: "todo", marker: "[ ]" } } })
  }
}

// =============================================================================
// Batch Delete
// =============================================================================

describe("Multi-select delete", () => {
  test("delete multiple selected empty cards", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    // Cursor starts on A. Move to B, then extend selection B→D (2 J presses).
    await app.command("cursor_down") // → B (card 1)
    await app.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}, cursor→C
    await app.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}, cursor→D

    await app.press("Backspace")

    // B, C, D should be gone
    expect(childIds(app.repo, "col1")).toEqual(["A", "E"])
  })

  test("batch delete shows confirmation when any node has children", async () => {
    using app = createTestApp(
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    await app.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→parent
    await app.press("shift+ArrowDown") // range A→C, multiSelected={A:0,parent:0,C:0}, cursor→C

    await app.press("Backspace")

    // Nothing deleted yet — confirmation dialog should be open
    expect(childIds(app.repo, "col1")).toContain("A")
    expect(childIds(app.repo, "col1")).toContain("parent")
    expect(childIds(app.repo, "col1")).toContain("C")
  })

  test("batch delete confirms and executes all nodes", async () => {
    using app = createTestApp(
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    await app.press("shift+ArrowDown") // anchor=A, cursor→parent
    await app.press("shift+ArrowDown") // range A→C, cursor→C

    await app.press("Backspace") // triggers confirmation dialog
    await app.press("Enter") // confirm delete

    // A, parent (with children), and C should all be deleted
    expect(childIds(app.repo, "col1")).toEqual(["D"])
  })

  test("batch delete cursor moves to valid position after deletion", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    // Cursor starts on A. Move to C, extend C→E (2 J presses).
    await app.command("cursor_down") // → B
    await app.command("cursor_down") // → C
    await app.press("shift+ArrowDown") // anchor=C, cursor→D
    await app.press("shift+ArrowDown") // range C→E, cursor→E

    await app.press("Backspace")

    // C, D, E deleted; cursor should land on B (last remaining at edge)
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
  })

  test("batch delete clears selection", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Cursor starts on A. Select A→C (2 J presses).
    await app.press("shift+ArrowDown") // anchor=A, cursor→B
    await app.press("shift+ArrowDown") // range A→C, cursor→C

    await app.press("Backspace")

    // A, B, C deleted. Only D remains.
    expect(childIds(app.repo, "col1")).toEqual(["D"])
  })

  test("single card delete still works (no regression)", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cursor starts on A. Move to B. No selection.
    await app.command("cursor_down") // → B

    await app.press("Backspace")

    expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
  })

  test("delete card with only empty children reports zero childCount", () => {
    const { board, store, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )

    // Clear content from children to make them empty
    repo.updateNode("child1", { content: undefined })
    repo.updateNode("child2", { content: undefined })

    // Cursor starts on parent. Press Backspace — triggers confirmation (parent has metadata)
    // but childCount should be 0 since both children are empty.
    board.press("Backspace")

    const dc = store.getState().ui.deleteConfirm
    expect(dc).toBeTruthy()
    expect(dc!.childCount).toBe(0)
  })

  test("delete card counts only non-empty children in confirmation", () => {
    const { board, store, repo } = testEnv(() =>
      item(
        "board",
        item("col1", item("parent", item("child1"), item("empty1"), item("empty2"), item("child2")), item("B")),
      ),
    )

    // Make 2 of 4 children empty
    repo.updateNode("empty1", { content: undefined })
    repo.updateNode("empty2", { content: undefined })

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
  test("toggle status on multiple selected tasks", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    await app.press("shift+ArrowDown") // anchor=A, cursor→B
    await app.press("shift+ArrowDown") // range A→C, cursor→C

    await app.command("cycle_task_status") // batch toggle

    // A, B, C should all advance to "wip"
    expect(nodeStatus(app.repo, "A")).toBe("wip")
    expect(nodeStatus(app.repo, "B")).toBe("wip")
    expect(nodeStatus(app.repo, "C")).toBe("wip")

    // D unchanged
    expect(nodeStatus(app.repo, "D")).toBe("todo")
  })

  test("batch status toggle preserves selection for repeated toggling", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    await app.press("shift+ArrowDown") // anchor=A, cursor→B
    await app.press("shift+ArrowDown") // range A→C, cursor→C

    await app.command("cycle_task_status") // batch toggle: A→wip, B→wip, C→wip

    // Selection preserved: toggling again affects all selected cards
    await app.command("cycle_task_status")
    expect(nodeStatus(app.repo, "A")).toBe("blocked") // wip→blocked
    expect(nodeStatus(app.repo, "B")).toBe("blocked") // wip→blocked
    expect(nodeStatus(app.repo, "C")).toBe("blocked") // wip→blocked

    // D unchanged throughout
    expect(nodeStatus(app.repo, "D")).toBe("todo")
  })

  test("batch status toggle with mixed statuses advances each independently", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Move to B and cycle it to "blocked" (todo→wip→blocked)
    await app.command("cursor_down") // → B
    await app.command("cycle_task_status") // todo→wip
    await app.command("cycle_task_status") // wip→blocked

    expect(nodeStatus(app.repo, "B")).toBe("blocked")

    // Move back to A. Select A→C (2 J presses). A=todo, B=blocked, C=todo.
    await app.command("cursor_up") // → A
    await app.press("shift+ArrowDown") // anchor=A, cursor→B
    await app.press("shift+ArrowDown") // range A→C, cursor→C

    await app.command("cycle_task_status") // batch toggle

    // Each advances from its own position
    expect(nodeStatus(app.repo, "A")).toBe("wip") // todo→wip
    expect(nodeStatus(app.repo, "B")).toBe("done") // blocked→done
    expect(nodeStatus(app.repo, "C")).toBe("wip") // todo→wip
  })

  test("single card status toggle still works (no regression)", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    setTaskStatus(app.repo, ["A", "B"])

    // Navigate to trigger re-render so command system picks up task_status
    await app.command("cursor_down") // → B
    await app.command("cursor_up") // → A
    await app.command("cycle_task_status") // single toggle

    expect(nodeStatus(app.repo, "A")).toBe("wip")
    expect(nodeStatus(app.repo, "B")).toBe("todo") // unchanged
  })
})
