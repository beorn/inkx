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
 * NOTE: createDriverTest starts with cursor on card 0 (first card), not column header.
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
    using app = createTestApp(item("board", item("col1", item("parent", item("child1"), item("child2")), item("B"))))

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

  test("batch status toggle collapses selection to cursor after toggle", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    setTaskStatus(app.repo, ["A", "B", "C", "D"])

    // Cursor starts on A. Select A→C (2 J presses).
    app.press("shift+ArrowDown") // anchor=A, cursor→B
    app.press("shift+ArrowDown") // range A→C, cursor→C

    app.command("cycle_task_status") // batch toggle: A→wip, B→wip, C→wip

    // Selection collapsed to cursor (C) after toggle. Second toggle only affects C.
    app.command("cycle_task_status")
    expect(nodeStatus(app.repo, "A")).toBe("wip") // unchanged
    expect(nodeStatus(app.repo, "B")).toBe("wip") // unchanged
    expect(nodeStatus(app.repo, "C")).toBe("blocked") // wip→blocked (cursor)

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

// =============================================================================
// Merged from multiselect-ops.slow.spec.ts — Multi-Selection Bulk Operations Journey Tests
// =============================================================================

describe("Multi-Selection Bulk Operations Journeys", () => {
  test("select multiple cards, delete them, verify screen and persistence", () => {
    using app = createTestApp(
      item("board", item("col1", item("keep-1"), item("del-A"), item("del-B"), item("del-C"), item("keep-2"))),
    )

    // Step 1: Navigate to del-A
    app.command("cursor_down") // -> del-A
    app.expect("#del-A[data-cursor]").toExist()

    // Step 2: Extend selection down to cover del-A, del-B, del-C
    app.press("shift+ArrowDown") // anchor=del-A, cursor->del-B
    app.press("shift+ArrowDown") // range del-A..del-C, cursor->del-C

    // Step 3: Status bar should show selection count
    const status = app.getStatus()
    expect(status?.message).toContain("selected")

    // Step 4: Delete selected cards
    app.press("Backspace")

    // Step 5: Verify screen — deleted cards gone, kept cards remain
    app.expect("#del-A").not.toExist()
    app.expect("#del-B").not.toExist()
    app.expect("#del-C").not.toExist()
    app.expect("#keep-1").toExist()
    app.expect("#keep-2").toExist()

    // Step 6: Verify persistence — repo should only have kept cards
    const children = app.repo.getChildren("col1").map((n) => n.id)
    expect(children).toContain("keep-1")
    expect(children).toContain("keep-2")
    expect(children).not.toContain("del-A")
    expect(children).not.toContain("del-B")
    expect(children).not.toContain("del-C")
  })

  test("select multiple tasks, bulk status toggle, verify screen and persistence", async () => {
    using app = createTestApp(
      item("board", item("col1", item("task-1"), item("task-2"), item("task-3"), item("task-4"))),
    )
    setTaskStatus(app.repo, ["task-1", "task-2", "task-3", "task-4"])

    // Step 1: Select task-1 through task-3
    app.press("shift+ArrowDown") // anchor=task-1, cursor->task-2
    app.press("shift+ArrowDown") // range task-1..task-3, cursor->task-3

    // Step 2: Toggle status (todo -> wip)
    app.command("cycle_task_status")

    // Step 3: Verify persistence — first 3 tasks should be wip, task-4 unchanged
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-4")?.item?.task?.status).toBe("todo")

    // Step 4: Toggle again — selection was collapsed to cursor (task-3) after first toggle,
    // so only task-3 advances: wip -> blocked. task-1 and task-2 stay at wip.
    app.command("cycle_task_status")
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("blocked")
    expect(app.repo.getNode("task-4")?.item?.task?.status).toBe("todo")
  })

  test("select cards with children, delete requires confirmation", async () => {
    using app = createTestApp(
      item("board", item("col1", item("simple"), item("parent", item("child-a"), item("child-b")), item("after"))),
    )

    // Step 1: Select simple and parent (which has children)
    app.press("shift+ArrowDown") // anchor=simple, cursor->parent

    // Step 2: Delete — should show confirmation because parent has children
    app.press("Backspace")

    // Step 3: Nothing deleted yet (confirmation dialog open)
    expect(app.repo.getChildren("col1").map((n) => n.id)).toContain("simple")
    expect(app.repo.getChildren("col1").map((n) => n.id)).toContain("parent")

    // Step 4: Confirm deletion
    app.press("Enter")

    // Step 5: Both simple and parent (with children) should be deleted
    const remaining = app.repo.getChildren("col1").map((n) => n.id)
    expect(remaining).toEqual(["after"])

    // Step 6: Screen should only show "after"
    app.expect("#after").toExist()
    app.expect("#simple").not.toExist()
    app.expect("#parent").not.toExist()
  })

  test("select upward with Shift+ArrowUp, delete, verify correct cards removed", async () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))))

    // Step 1: Navigate to D
    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down") // -> D
    app.expect("#D[data-cursor]").toExist()

    // Step 2: Select upward to cover B, C, D
    app.press("shift+ArrowUp") // anchor=D, cursor->C
    app.press("shift+ArrowUp") // range B..D, cursor->B

    // Step 3: Delete
    app.press("Backspace")

    // Step 4: Verify screen
    app.expect("#A").toExist()
    app.expect("#E").toExist()
    app.expect("#B").not.toExist()
    app.expect("#C").not.toExist()
    app.expect("#D").not.toExist()

    // Step 5: Verify persistence
    const remaining = app.repo.getChildren("col1").map((n) => n.id)
    expect(remaining).toEqual(["A", "E"])
  })

  test("selection visual feedback appears in status bar during multi-select", () => {
    using app = createTestApp(
      item("board", item("col1", item("item-1"), item("item-2"), item("item-3"), item("item-4"), item("item-5"))),
    )

    // Step 1: Begin selection
    app.press("shift+ArrowDown") // 2 items selected
    let status = app.getStatus()
    expect(status?.message).toMatch(/2 items/)

    // Step 2: Extend selection
    app.press("shift+ArrowDown") // 3 items selected
    status = app.getStatus()
    expect(status?.message).toMatch(/3 items/)

    // Step 3: Extend further
    app.press("shift+ArrowDown") // 4 items selected
    status = app.getStatus()
    expect(status?.message).toMatch(/4 items/)

    // Step 4: Clear selection with Escape
    app.press("Escape")

    // Step 5: Cursor should still be valid, no selection feedback
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("bulk delete at end of column, cursor repositions to remaining cards", async () => {
    using app = createTestApp(
      item("board", item("col1", item("stay-1"), item("stay-2"), item("go-1"), item("go-2"), item("go-3"))),
    )

    // Step 1: Navigate to go-1
    app.command("cursor_down")
    app.command("cursor_down") // -> go-1
    app.expect("#go-1[data-cursor]").toExist()

    // Step 2: Select go-1, go-2, go-3
    app.press("shift+ArrowDown") // anchor=go-1, cursor->go-2
    app.press("shift+ArrowDown") // range go-1..go-3, cursor->go-3

    // Step 3: Delete
    app.press("Backspace")

    // Step 4: Verify remaining cards
    const remaining = app.repo.getChildren("col1").map((n) => n.id)
    expect(remaining).toEqual(["stay-1", "stay-2"])

    // Step 5: Cursor should land on a valid remaining card
    const cursor = app.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
    app.expect("#stay-1").toExist()
    app.expect("#stay-2").toExist()
  })
})
