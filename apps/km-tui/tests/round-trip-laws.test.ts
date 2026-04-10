/**
 * Round-Trip Persistence Laws
 *
 * Structural tests verifying data survives create → read and edit → persist → read cycles.
 * These are property-based laws: any node created through the board must be retrievable
 * from the repo with its content intact.
 */

import { describe, test, expect } from "vitest"
import { createTestApp } from "./helpers/test-app.ts"
import { item } from "./helpers/board-test.ts"

describe("Round-Trip Persistence Laws", () => {
  test("creating a node and reading it back preserves content", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    // Leaf nodes use content field, id = content string
    const node = app.repo.getNode("task1")
    expect(node).not.toBeNull()
    expect(node!.content).toBe("task1")

    // Container nodes use data.name, no content field
    const col = app.repo.getNode("col")
    expect(col).not.toBeNull()
  })

  test("parent-child relationships are preserved in repo", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item("task2"))))

    const task1 = app.repo.getNode("task1")
    expect(task1).not.toBeNull()
    expect(task1!.parent_id).toBe("col")

    const task2 = app.repo.getNode("task2")
    expect(task2).not.toBeNull()
    expect(task2!.parent_id).toBe("col")
  })

  test("sibling ordering is preserved via parent_idx", () => {
    using app = createTestApp(item("board", item("col", item("first"), item("second"), item("third"))))

    const first = app.repo.getNode("first")
    const second = app.repo.getNode("second")
    const third = app.repo.getNode("third")

    expect(first!.parent_idx).toBeLessThan(second!.parent_idx)
    expect(second!.parent_idx).toBeLessThan(third!.parent_idx)
  })

  test("indent changes parent_id in repo", () => {
    using app = createTestApp(item("board", item("col", item("parent"), item("child"))))

    // Move cursor to "child"
    app.command("cursor_down")

    // Verify cursor is on child before indenting
    expect(app.state.cursor).toBe("child")

    app.command("indent_node")

    const child = app.repo.getNode("child")
    expect(child).not.toBeNull()
    expect(child!.parent_id).toBe("parent")
  })

  test("insert_below creates a new node in repo", () => {
    using app = createTestApp(item("board", item("col", item("existing"))))

    // Cursor is on "existing"
    expect(app.state.cursor).toBe("existing")

    app.command("insert_below")

    // A new node should have been created — cursor moves to it
    const newId = app.state.cursor
    expect(newId).not.toBe("existing")
    expect(newId).not.toBeNull()

    const newNode = app.repo.getNode(newId!)
    expect(newNode).not.toBeNull()
    expect(newNode!.parent_id).toBe("col")
  })

  test("toggle_task_done persists status change", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    const before = app.repo.getNode("task1")
    expect(before!.item?.task?.status).toBe("todo")

    app.command("toggle_task_done")

    const after = app.repo.getNode("task1")
    expect(after!.item?.task?.status).toBe("done")
  })

  test("undo restores previous state", () => {
    using app = createTestApp(item("board", item("col", item("task1"))))

    const beforeStatus = app.repo.getNode("task1")!.item?.task?.status
    expect(beforeStatus).toBe("todo")

    // Toggle done, then undo
    app.command("toggle_task_done")
    expect(app.repo.getNode("task1")!.item?.task?.status).toBe("done")

    app.command("undo")
    const afterUndo = app.repo.getNode("task1")!.item?.task?.status
    expect(afterUndo).toBe(beforeStatus)
  })

  test("multi-column board preserves column structure", () => {
    using app = createTestApp(
      item(
        "board",
        item("Todo", item("task1"), item("task2")),
        item("In Progress", item("task3")),
        item("Done", item("task4")),
      ),
    )

    // All columns exist
    expect(app.repo.getNode("Todo")).not.toBeNull()
    expect(app.repo.getNode("In Progress")).not.toBeNull()
    expect(app.repo.getNode("Done")).not.toBeNull()

    // Tasks are in correct columns
    expect(app.repo.getNode("task1")!.parent_id).toBe("Todo")
    expect(app.repo.getNode("task3")!.parent_id).toBe("In Progress")
    expect(app.repo.getNode("task4")!.parent_id).toBe("Done")
  })
})
