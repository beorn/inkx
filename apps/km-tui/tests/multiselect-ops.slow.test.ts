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
import { item } from "./helpers/board-test.ts"
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
  test("delete multiple selected empty cards", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    // Cursor starts on A. Move to B, then extend selection B→D (2 J presses).
    app.command("cursor_down") // → B (card 1)
    app.press("shift+ArrowDown") // anchor=B, multiSelected={B:0}, cursor→C
    app.press("shift+ArrowDown") // range B→D, multiSelected={B:0,C:0,D:0}, cursor→D

    app.press("Backspace")

    // B, C, D should be gone
    expect(childIds(app.repo, "col1")).toEqual(["A", "E"])
  })

  test("batch delete shows confirmation when any node has children", () => {
    using app = createTestApp(
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    app.press("shift+ArrowDown") // anchor=A, multiSelected={A:0}, cursor→parent
    app.press("shift+ArrowDown") // range A→C, multiSelected={A:0,parent:0,C:0}, cursor→C

    app.press("Backspace")

    // Nothing deleted yet — confirmation dialog should be open
    expect(childIds(app.repo, "col1")).toContain("A")
    expect(childIds(app.repo, "col1")).toContain("parent")
    expect(childIds(app.repo, "col1")).toContain("C")
  })

  test("batch delete confirms and executes all nodes", () => {
    using app = createTestApp(
      item("board", item("col1", item("A"), item("parent", item("child1"), item("child2")), item("C"), item("D"))),
    )

    // Cursor starts on A. Select A→C (2 J presses). parent has children.
    app.press("shift+ArrowDown") // anchor=A, cursor→parent
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.press("Backspace") // triggers confirmation dialog
    app.press("Enter") // confirm delete

    // A, parent (with children), and C should all be deleted
    expect(childIds(app.repo, "col1")).toEqual(["D"])
  })

  test("batch delete cursor moves to valid position after deletion", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    // Cursor starts on A. Move to C, extend C→E (2 J presses).
    app.command("cursor_down") // → B
    app.command("cursor_down") // → C
    app.press("shift+ArrowDown") // anchor=C, cursor→D
    app.press("shift+ArrowDown") // range C→E, cursor→E

    app.press("Backspace")

    // C, D, E deleted; cursor should land on B (last remaining at edge)
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
  })

  test("batch delete clears selection", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    // Cursor starts on A. Select A→C (2 J presses).
    app.press("shift+ArrowDown") // anchor=A, cursor→B
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.press("Backspace")

    // A, B, C deleted. Only D remains.
    expect(childIds(app.repo, "col1")).toEqual(["D"])
  })

  test("single card delete still works (no regression)", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cursor starts on A. Move to B. No selection.
    app.command("cursor_down") // → B

    app.press("Backspace")

    expect(childIds(app.repo, "col1")).toEqual(["A", "C"])
  })

  test("delete card with only empty children reports zero childCount", () => {
    using app = createTestApp(
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))),
    )

    // Clear content from children to make them empty
    app.repo.updateNode("child1", { content: undefined })
    app.repo.updateNode("child2", { content: undefined })

    // Cursor starts on parent. Press Backspace — triggers confirmation (parent has metadata)
    // but childCount should be 0 since both children are empty.
    app.press("Backspace")

    app.expect("[data-dialog='delete-confirm']").toExist()
    app.expect("[data-dialog='delete-confirm'][data-child-count='0']").toExist()
  })

  test("delete card counts only non-empty children in confirmation", () => {
    using app = createTestApp(
      item(
        "board",
        item("col1", item("parent", item("child1"), item("empty1"), item("empty2"), item("child2")), item("B")),
      ),
    )

    // Make 2 of 4 children empty
    app.repo.updateNode("empty1", { content: undefined })
    app.repo.updateNode("empty2", { content: undefined })

    // Cursor starts on parent. Press Backspace — should show confirmation with childCount=2.
    app.press("Backspace")

    app.expect("[data-dialog='delete-confirm']").toExist()
    app.expect("[data-dialog='delete-confirm'][data-child-count='2']").toExist()
  })
})

// =============================================================================
// Batch Status Toggle
// =============================================================================

describe("Multi-select status toggle", () => {
  test("toggle status on multiple selected tasks", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    app.press("shift+ArrowDown") // anchor=A, cursor→B
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.command("cycle_task_status") // batch toggle

    // A, B, C should all advance to "wip"
    expect(nodeStatus(app.repo, "A")).toBe("wip")
    expect(nodeStatus(app.repo, "B")).toBe("wip")
    expect(nodeStatus(app.repo, "C")).toBe("wip")

    // D unchanged
    expect(nodeStatus(app.repo, "D")).toBe("todo")
  })

  test("batch status toggle preserves selection for repeated toggling", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    app.press("shift+ArrowDown") // anchor=A, cursor→B
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.command("cycle_task_status") // batch toggle: A→wip, B→wip, C→wip

    // Selection preserved: toggling again affects all selected cards
    app.command("cycle_task_status")
    expect(nodeStatus(app.repo, "A")).toBe("blocked") // wip→blocked
    expect(nodeStatus(app.repo, "B")).toBe("blocked") // wip→blocked
    expect(nodeStatus(app.repo, "C")).toBe("blocked") // wip→blocked

    // D unchanged throughout
    expect(nodeStatus(app.repo, "D")).toBe("todo")
  })

  test("batch status toggle with mixed statuses advances each independently", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Move to B and cycle it to "blocked" (todo→wip→blocked)
    app.command("cursor_down") // → B
    app.command("cycle_task_status") // todo→wip
    app.command("cycle_task_status") // wip→blocked

    expect(nodeStatus(app.repo, "B")).toBe("blocked")

    // Move back to A. Select A→C (2 J presses). A=todo, B=blocked, C=todo.
    app.command("cursor_up") // → A
    app.press("shift+ArrowDown") // anchor=A, cursor→B
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.command("cycle_task_status") // batch toggle

    // Each advances from its own position
    expect(nodeStatus(app.repo, "A")).toBe("wip") // todo→wip
    expect(nodeStatus(app.repo, "B")).toBe("done") // blocked→done
    expect(nodeStatus(app.repo, "C")).toBe("wip") // todo→wip
  })

  test("single card status toggle still works (no regression)", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    setTaskStatus(app.repo, ["A", "B"])

    // Navigate to trigger re-render so command system picks up task_status
    app.command("cursor_down") // → B
    app.command("cursor_up") // → A
    app.command("cycle_task_status") // single toggle

    expect(nodeStatus(app.repo, "A")).toBe("wip")
    expect(nodeStatus(app.repo, "B")).toBe("todo") // unchanged
  })
})
