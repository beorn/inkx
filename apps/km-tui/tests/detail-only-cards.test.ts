/**
 * Tests for detailOnly nodes being excluded from card/column views.
 *
 * Imported Asana comments, attachments, and activity logs are stored as li children
 * of tasks with data.detailOnly = true. These should only be visible in the detail
 * pane, not as cards in columns.
 *
 * Bug: km-tui.comments-as-cards
 */

import { describe, test } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

/** Create an li node with detailOnly data (like imported comments/attachments/activity) */
function detailOnlyItem(id: string, content: string, ...childArrays: KNode[][]): KNode[] {
  const node: KNode = {
    id,
    type: "li",
    content,
    data: { detailOnly: true },
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  const result: KNode[] = [node]
  childArrays.forEach((childArray, idx) => {
    const directChild = childArray[0]
    if (directChild) {
      directChild.parent_id = id
      directChild.parent_idx = idx
    }
    result.push(...childArray)
  })
  return result
}

describe("detailOnly nodes hidden from card view", () => {
  test("comments with detailOnly do not appear as cards in a column", () => {
    // Simulate a column with tasks and a detailOnly "Comments" node.
    // The column has two regular tasks plus a "Comments" section that
    // should be hidden from card view.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item("task-1"),
            item("task-2"),
            detailOnlyItem("comments-group", "Comments", item("comment-1"), item("comment-2")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Regular tasks should be visible as cards
    board.expect("#task-1").toExist()
    board.expect("#task-2").toExist()

    // Comments group and individual comments should NOT appear as cards
    board.expect("#comments-group").not.toExist()
    board.expect("#comment-1").not.toExist()
    board.expect("#comment-2").not.toExist()
  })

  test("detailOnly nodes excluded from virtual body column at root level", () => {
    // When zoomed into a task, body children become cards in a virtual body column.
    // detailOnly nodes (comments, attachments) should be excluded.
    const { board } = testEnv(
      () =>
        item(
          "board",
          // Regular body content
          item.paragraph("Some description"),
          // detailOnly sections
          detailOnlyItem("comments", "Comments", item("c1"), item("c2")),
          detailOnlyItem("attachments", "Attachments", item("att1")),
          // Structural children (columns)
          item("subtask-col", item("sub-1")),
        ),
      { columns: 80, rows: 24 },
    )

    // Subtask column and its child should render
    board.expect("#sub-1").toExist()

    // detailOnly nodes should NOT render as cards
    board.expect("#comments").not.toExist()
    board.expect("#attachments").not.toExist()
    board.expect("#c1").not.toExist()
    board.expect("#c2").not.toExist()
    board.expect("#att1").not.toExist()
  })

  test("regular li nodes still appear as cards (no false filtering)", () => {
    // Ensure that li nodes WITHOUT detailOnly still appear normally
    const { board } = testEnv(() => item("board", item("col", item("task-a"), item("task-b"), item("regular-li"))), {
      columns: 80,
      rows: 24,
    })

    board.expect("#task-a").toExist()
    board.expect("#task-b").toExist()
    board.expect("#regular-li").toExist()
  })
})
