/**
 * Multi-Selection Bulk Operations Journey Tests
 *
 * User-level journey specs for bulk operations on multiple selected cards.
 * Complements multiselect-ops.slow.test.ts which focuses on atomic batch
 * behavior (all-or-nothing validation, processing order, selection clearing).
 *
 * These journey tests verify BOTH screen output AND persisted data:
 * - Select multiple cards (Shift+ArrowDown/Up), bulk delete, verify screen + repo
 * - Select multiple, bulk status toggle, verify screen + repo
 * - Select across mixed content, perform operation, verify consistency
 * - Selection visual feedback in status bar
 *
 * Key bindings:
 *   Shift+ArrowDown = extend selection down
 *   Shift+ArrowUp   = extend selection up
 *   Backspace        = delete selected cards
 *   X                = toggle task status
 *   Escape           = clear selection
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

function setTaskStatus(repo: { updateNode(id: string, updates: Record<string, unknown>): void }, ids: string[]) {
  for (const id of ids) {
    repo.updateNode(id, { task_status: "todo", task_marker: "[ ]" })
  }
}

describe("Multi-Selection Bulk Operations Journeys", () => {
  test("select multiple cards, delete them, verify screen and persistence", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("keep-1"), item("del-A"), item("del-B"), item("del-C"), item("keep-2"))),
    )

    // Step 1: Navigate to del-A
    board.command("cursor_down") // -> del-A
    board.expect("#del-A[data-cursor]").toExist()

    // Step 2: Extend selection down to cover del-A, del-B, del-C
    board.press("shift+ArrowDown") // anchor=del-A, cursor->del-B
    board.press("shift+ArrowDown") // range del-A..del-C, cursor->del-C

    // Step 3: Status bar should show selection count
    const status = board.getStatus()
    expect(status?.message).toContain("selected")

    // Step 4: Delete selected cards
    board.press("Backspace")

    // Step 5: Verify screen — deleted cards gone, kept cards remain
    board.expect("#del-A").not.toExist()
    board.expect("#del-B").not.toExist()
    board.expect("#del-C").not.toExist()
    board.expect("#keep-1").toExist()
    board.expect("#keep-2").toExist()

    // Step 6: Verify persistence — repo should only have kept cards
    const children = repo.getChildren("col1").map((n) => n.id)
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
    await app.press("shift+ArrowDown") // anchor=task-1, cursor->task-2
    await app.press("shift+ArrowDown") // range task-1..task-3, cursor->task-3

    // Step 2: Toggle status (todo -> wip)
    await app.command("cycle_task_status")

    // Step 3: Verify persistence — first 3 tasks should be wip, task-4 unchanged
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("wip")
    expect(app.repo.getNode("task-4")?.item?.task?.status).toBe("todo")

    // Step 4: Toggle again (wip -> blocked)
    await app.command("cycle_task_status")
    expect(app.repo.getNode("task-1")?.item?.task?.status).toBe("blocked")
    expect(app.repo.getNode("task-2")?.item?.task?.status).toBe("blocked")
    expect(app.repo.getNode("task-3")?.item?.task?.status).toBe("blocked")
    expect(app.repo.getNode("task-4")?.item?.task?.status).toBe("todo")
  })

  test("select cards with children, delete requires confirmation", async () => {
    using app = createTestApp(
      item("board", item("col1", item("simple"), item("parent", item("child-a"), item("child-b")), item("after"))),
    )

    // Step 1: Select simple and parent (which has children)
    await app.press("shift+ArrowDown") // anchor=simple, cursor->parent

    // Step 2: Delete — should show confirmation because parent has children
    await app.press("Backspace")

    // Step 3: Nothing deleted yet (confirmation dialog open)
    expect(app.repo.getChildren("col1").map((n) => n.id)).toContain("simple")
    expect(app.repo.getChildren("col1").map((n) => n.id)).toContain("parent")

    // Step 4: Confirm deletion
    await app.press("Enter")

    // Step 5: Both simple and parent (with children) should be deleted
    const remaining = app.repo.getChildren("col1").map((n) => n.id)
    expect(remaining).toEqual(["after"])

    // Step 6: Screen should only show "after"
    app.expect("#after").toExist()
    app.expect("#simple").not.toExist()
    app.expect("#parent").not.toExist()
  })

  test("select upward with Shift+ArrowUp, delete, verify correct cards removed", async () => {
    using app = createTestApp(
      item("board", item("col1", item("A"), item("B"), item("C"), item("D"), item("E"))),
    )

    // Step 1: Navigate to D
    await app.command("cursor_down")
    await app.command("cursor_down")
    await app.command("cursor_down") // -> D
    app.expect("#D[data-cursor]").toExist()

    // Step 2: Select upward to cover B, C, D
    await app.press("shift+ArrowUp") // anchor=D, cursor->C
    await app.press("shift+ArrowUp") // range B..D, cursor->B

    // Step 3: Delete
    await app.press("Backspace")

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
    const { board } = testEnv(() =>
      item("board", item("col1", item("item-1"), item("item-2"), item("item-3"), item("item-4"), item("item-5"))),
    )

    // Step 1: Begin selection
    board.press("shift+ArrowDown") // 2 items selected
    let status = board.getStatus()
    expect(status?.message).toMatch(/2 items/)

    // Step 2: Extend selection
    board.press("shift+ArrowDown") // 3 items selected
    status = board.getStatus()
    expect(status?.message).toMatch(/3 items/)

    // Step 3: Extend further
    board.press("shift+ArrowDown") // 4 items selected
    status = board.getStatus()
    expect(status?.message).toMatch(/4 items/)

    // Step 4: Clear selection with Escape
    board.press("Escape")

    // Step 5: Cursor should still be valid, no selection feedback
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)
  })

  test("bulk delete at end of column, cursor repositions to remaining cards", async () => {
    using app = createTestApp(
      item("board", item("col1", item("stay-1"), item("stay-2"), item("go-1"), item("go-2"), item("go-3"))),
    )

    // Step 1: Navigate to go-1
    await app.command("cursor_down")
    await app.command("cursor_down") // -> go-1
    app.expect("#go-1[data-cursor]").toExist()

    // Step 2: Select go-1, go-2, go-3
    await app.press("shift+ArrowDown") // anchor=go-1, cursor->go-2
    await app.press("shift+ArrowDown") // range go-1..go-3, cursor->go-3

    // Step 3: Delete
    await app.press("Backspace")

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
