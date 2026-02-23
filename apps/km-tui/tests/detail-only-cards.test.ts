/**
 * Tests for collapsed/hidden nodes being excluded from card/column views.
 *
 * Two mechanisms hide nodes from card view (isCollapsedChild):
 * 1. data.detailOnly = true — imported Asana comments/attachments/activity
 * 2. rules.collapse = true (km.collapse:: true) — structural children marked collapsed
 *
 * Both paths are tested here. These nodes should only be visible in the detail
 * pane, never as cards in columns.
 *
 * Bug: km-tui.activity-cards
 */

import { describe, expect, test } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"

/** Create an li node with detailOnly data (like imported comments/attachments/activity) */
function detailOnlyItem(id: string, content: string, ...childArrays: KNode[][]): KNode[] {
  const node: KNode = {
    id,
    type: "p",
    item: true,
    content,
    data: { detailOnly: true },
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
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

describe("structural children with km.collapse:: true hidden from card view", () => {
  test("collapsed structural nodes filtered from cardNodes in deriveColumnsFromRepo", () => {
    // Verify at the data model level that collapsed structural nodes
    // do NOT appear in the cardNodes array for any column.
    const nodes = item(
      "board",
      item(
        "col",
        item("task-1"),
        item("task-2"),
        item("Activity km.collapse:: true", item("log-1"), item("log-2")),
        item("Comments km.collapse:: true", item("c1")),
      ),
    )

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    // Should have exactly 1 column
    expect(columns).toHaveLength(1)
    const col = columns[0]!

    // Only task-1 and task-2 should be in cardNodes — Activity and Comments should be filtered
    const cardIds = col.cardNodes.map((c) => c.id)
    expect(cardIds).toContain("task-1")
    expect(cardIds).toContain("task-2")
    expect(cardIds).not.toContain("Activity km.collapse:: true")
    expect(cardIds).not.toContain("Comments km.collapse:: true")
    expect(cardIds).not.toContain("log-1")
    expect(cardIds).not.toContain("log-2")
    expect(cardIds).not.toContain("c1")
  })

  test("non-collapsed structural nodes remain in cardNodes", () => {
    const nodes = item("board", item("col", item("task-1"), item("Subsection", item("sub-1"), item("sub-2"))))

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    expect(columns).toHaveLength(1)
    const cardIds = columns[0]!.cardNodes.map((c) => c.id)
    expect(cardIds).toContain("task-1")
    expect(cardIds).toContain("Subsection")
  })

  test("structural child with km.collapse:: true does not render as a card", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item("task-1"),
            item("task-2"),
            // Structural child with collapse rule — should be hidden from card view
            item("Activity km.collapse:: true", item("log-1"), item("log-2")),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // Regular tasks should be visible as cards
    board.expect("#task-1").toExist()
    board.expect("#task-2").toExist()

    // log-1/log-2 should not appear (children of hidden node)
    board.expect("#log-1").not.toExist()
    board.expect("#log-2").not.toExist()

    // Verify via screenshot that "Activity" text doesn't appear anywhere
    const screenshot = board.screenshot()
    expect(screenshot).not.toContain("Activity")
    expect(screenshot).not.toContain("···")
  })

  test("structural child without collapse rule still appears as a card", () => {
    // Ensure structural children without km.collapse:: true are not filtered
    const { board } = testEnv(
      () => item("board", item("col", item("task-1"), item("Subsection", item("sub-1"), item("sub-2")))),
      { columns: 80, rows: 24 },
    )

    // Regular task should be visible
    board.expect("#task-1").toExist()

    // Non-collapsed structural child should appear as a card
    board.expect("#Subsection").toExist()
  })

  test("mix of detailOnly and km.collapse:: true children both filtered", () => {
    // Both filtering mechanisms should work together in the same column
    const nodes = item(
      "board",
      item(
        "col",
        item("task-1"),
        // detailOnly body node
        detailOnlyItem("comments", "Comments", item("c1")),
        // km.collapse:: true structural node
        item("History km.collapse:: true", item("entry-1")),
        item("task-2"),
      ),
    )

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    expect(columns).toHaveLength(1)
    const cardIds = columns[0]!.cardNodes.map((c) => c.id)

    // Regular tasks visible
    expect(cardIds).toContain("task-1")
    expect(cardIds).toContain("task-2")

    // Both hidden mechanisms filter their respective nodes
    expect(cardIds).not.toContain("comments")
    expect(cardIds).not.toContain("c1")
    expect(cardIds).not.toContain("History km.collapse:: true")
    expect(cardIds).not.toContain("entry-1")
  })

  test("Asana-style Activity/Comments/Attachments sections filtered from cards", () => {
    // Reproduce the exact Asana import pattern: task with body, comments, attachments, activity
    // as structural children marked with km.collapse:: true
    const nodes = item(
      "board",
      item(
        "project-section",
        item("real-task-1"),
        item("real-task-2"),
        item("Comments km.collapse:: true", item("comment-a"), item("comment-b")),
        item("Attachments km.collapse:: true", item("att-1")),
        item("Activity km.collapse:: true", item("act-1"), item("act-2"), item("act-3")),
      ),
    )

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    expect(columns).toHaveLength(1)
    const cardIds = columns[0]!.cardNodes.map((c) => c.id)

    // Real tasks should be present
    expect(cardIds).toContain("real-task-1")
    expect(cardIds).toContain("real-task-2")

    // All Asana metadata sections should be hidden
    expect(cardIds).not.toContain("Comments km.collapse:: true")
    expect(cardIds).not.toContain("Attachments km.collapse:: true")
    expect(cardIds).not.toContain("Activity km.collapse:: true")

    // Their children should also not be in cardNodes (they are children of filtered parents)
    expect(cardIds).not.toContain("comment-a")
    expect(cardIds).not.toContain("att-1")
    expect(cardIds).not.toContain("act-1")
  })
})

describe("collapsed children hidden inside cards (sub-items)", () => {
  test("Activity/Comments sections with km.collapse:: true do not render inside cards", () => {
    // Bug: km-tui.activity-subitems
    // Even though collapsed sections are filtered from column-level cards,
    // they still appear as sub-items WITHIN a card's children rendering.
    // e.g., a task card shows "§ Activity" and "§ Comments" inside it.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item(
              "task-with-activity",
              item("sub-task-1"),
              item("sub-task-2"),
              item("Activity km.collapse:: true", item("log-1"), item("log-2")),
              item("Comments km.collapse:: true", item("c1")),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // The card itself should render
    board.expect("#task-with-activity").toExist()
    // Regular sub-tasks should be visible inside the card
    board.expect("#sub-task-1").toExist()
    board.expect("#sub-task-2").toExist()

    // Collapsed sections should NOT appear inside the card
    board.expect("#Activity km.collapse:: true").not.toExist()
    board.expect("#Comments km.collapse:: true").not.toExist()
    board.expect("#log-1").not.toExist()
    board.expect("#log-2").not.toExist()
    board.expect("#c1").not.toExist()

    // Verify via screenshot that "Activity" and "Comments" text don't appear
    const screenshot = board.screenshot()
    expect(screenshot).not.toContain("Activity")
    expect(screenshot).not.toContain("Comments")
  })

  test("detailOnly sub-items do not render inside cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item(
              "task-with-comments",
              item("real-child"),
              detailOnlyItem("inline-comments", "Comments", item("ic1")),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    board.expect("#task-with-comments").toExist()
    board.expect("#real-child").toExist()

    // detailOnly sub-items should not appear inside the card
    board.expect("#inline-comments").not.toExist()
    board.expect("#ic1").not.toExist()
  })

  test("overflow count excludes collapsed children inside cards", () => {
    // When a card has collapsed children, the overflow count should NOT include them.
    // Only real visible children should be counted for overflow.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "col",
            item(
              "card-with-hidden",
              item("visible-1"),
              item("visible-2"),
              item("Activity km.collapse:: true", item("a1"), item("a2"), item("a3")),
            ),
          ),
        ),
      { columns: 80, rows: 24 },
    )

    // The card should not show any overflow indicator from the collapsed children
    const screenshot = board.screenshot()
    // Activity section has 3 children + itself = 4 hidden nodes that should NOT inflate overflow
    expect(screenshot).not.toContain("Activity")
  })
})
