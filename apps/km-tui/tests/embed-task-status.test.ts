/**
 * Test: Cycling task status on embedded links
 *
 * Bug km-79kld: Pressing 'x' on an embedded link that points to a task
 * node doesn't toggle the task status, because the command gate checks
 * isTask on the link node (which has no task_status) instead of the
 * link target.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("embed task status cycling (km-79kld)", () => {
  /** Build a board where embeds link to task nodes */
  function embedTaskBoard() {
    const env = testEnv(() => {
      const nodes = item(
        "board",
        item("col1", item("embed-a"), item("embed-b"), item("regular-task")),
        item("col2", item("task-x")),
      )
      // Set up embed-a and embed-b as link nodes pointing to task targets
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "p"
          n.link_to = "target-a"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.link_to = "target-b"
          n.task_status = undefined
          n.data = {}
        }
        if (n.id === "regular-task") {
          n.type = "li"
          n.list_marker = "-"
          n.task_status = "todo"
          n.task_marker = "[ ]"
        }
        if (n.id === "col1" || n.id === "col2") {
          n.type = "oi"
          n.fstype = "mdsection"
          n.data = { depth: 2 }
        }
      }

      // Add the target nodes (tasks that the embeds point to)
      nodes.push({
        id: "target-a",
        type: "li",
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 0,
        link_to: null,
        task_status: "todo",
        task_marker: "[ ]",
        content: "Target task A",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      })
      nodes.push({
        id: "target-b",
        type: "li",
        list_marker: "-",
        parent_id: "some-other-parent",
        parent_idx: 1,
        link_to: null,
        task_status: "done",
        task_marker: "[x]",
        content: "Target task B",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      })

      return nodes
    })
    return env
  }

  test("x toggles task status on embed link targeting a task", () => {
    const { board, repo } = embedTaskBoard()

    // Cursor starts on embed-a (first card in col1)
    // embed-a links to target-a which has task_status: "todo"
    const targetBefore = repo.getNode("target-a")
    expect(targetBefore?.task_status).toBe("todo")

    // Press x to toggle task done
    board.press("x")

    // target-a should now cycle to next status
    const targetAfter = repo.getNode("target-a")
    expect(targetAfter?.task_status).not.toBe("todo")
  })

  test("x on regular task node still works", () => {
    const { board, repo } = embedTaskBoard()

    // Navigate to regular-task (3rd card in col1)
    board.press("j") // embed-b
    board.press("j") // regular-task

    const before = repo.getNode("regular-task")
    expect(before?.task_status).toBe("todo")

    board.press("x")

    const after = repo.getNode("regular-task")
    expect(after?.task_status).not.toBe("todo")
  })

  test("x on embed link targeting done task toggles to todo", () => {
    const { board, repo } = embedTaskBoard()

    // Navigate to embed-b (2nd card in col1)
    board.press("j")

    const targetBefore = repo.getNode("target-b")
    expect(targetBefore?.task_status).toBe("done")

    board.press("x")

    // toggle_task_done: done -> todo
    const targetAfter = repo.getNode("target-b")
    expect(targetAfter?.task_status).not.toBe("done")
  })
})
