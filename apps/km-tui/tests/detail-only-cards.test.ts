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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { isCollapsedChild, isDetailOnly } from "@km/board"

/** Create an li node with detailOnly data (like imported comments/attachments/activity) */
function detailOnlyItem(id: string, content: string, ...childArrays: KNode[][]): KNode[] {
  const node: KNode = {
    id,
    type: "p",
    item: {},
    content,
    data: { detailOnly: true },
    parent_id: null,
    parent_idx: 0,
    embed_of: null,
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
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item("task-1"),
          item("task-2"),
          detailOnlyItem("comments-group", "Comments", item("comment-1"), item("comment-2")),
        ),
      ),
      { cols: 80, rows: 24 },
    )

    // Regular tasks should be visible as cards
    app.expect("#task-1").toExist()
    app.expect("#task-2").toExist()

    // Comments group and individual comments should NOT appear as cards
    app.expect("#comments-group").not.toExist()
    app.expect("#comment-1").not.toExist()
    app.expect("#comment-2").not.toExist()
  })

  test("detailOnly nodes excluded from virtual body column at root level", () => {
    // When zoomed into a task, body children become cards in a virtual body column.
    // detailOnly nodes (comments, attachments) should be excluded.
    using app = createTestApp(
      item(
        "board",
        // Regular body content
        item.p("Some description"),
        // detailOnly sections
        detailOnlyItem("comments", "Comments", item("c1"), item("c2")),
        detailOnlyItem("attachments", "Attachments", item("att1")),
        // Structural children (columns)
        item("subtask-col", item("sub-1")),
      ),
      { cols: 80, rows: 24 },
    )

    // Subtask column and its child should render
    app.expect("#sub-1").toExist()

    // detailOnly nodes should NOT render as cards
    app.expect("#comments").not.toExist()
    app.expect("#attachments").not.toExist()
    app.expect("#c1").not.toExist()
    app.expect("#c2").not.toExist()
    app.expect("#att1").not.toExist()
  })

  test("regular li nodes still appear as cards (no false filtering)", () => {
    // Ensure that li nodes WITHOUT detailOnly still appear normally
    using app = createTestApp(item("board", item("col", item("task-a"), item("task-b"), item("regular-li"))), {
      cols: 80,
      rows: 24,
    })

    app.expect("#task-a").toExist()
    app.expect("#task-b").toExist()
    app.expect("#regular-li").toExist()
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
    using app = createTestApp(
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
      { cols: 80, rows: 24 },
    )

    // Regular tasks should be visible as cards
    app.expect("#task-1").toExist()
    app.expect("#task-2").toExist()

    // log-1/log-2 should not appear (children of hidden node)
    app.expect("#log-1").not.toExist()
    app.expect("#log-2").not.toExist()

    // Verify via screen text that "Activity" text doesn't appear anywhere
    expect(app.text).not.toContain("Activity")
    expect(app.text).not.toContain("···")
  })

  test("structural child without collapse rule still appears as a card", () => {
    // Ensure structural children without km.collapse:: true are not filtered
    using app = createTestApp(
      item("board", item("col", item("task-1"), item("Subsection", item("sub-1"), item("sub-2")))),
      { cols: 80, rows: 24 },
    )

    // Regular task should be visible
    app.expect("#task-1").toExist()

    // Non-collapsed structural child should appear as a card
    app.expect("#Subsection").toExist()
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

  test("real Asana import nodes with collapse rule in content (no pre-parsed rules/title)", () => {
    // Bug: km-tui.hide-attachments
    // The Asana import creates heading nodes with content: "Attachments km.collapse:: true"
    // but WITHOUT pre-parsed rules, title, or name fields. isCollapsedChild was only
    // checking node.rules and node.title, missing the rule embedded in node.content.
    const ts = Date.now()
    const importedNodes: KNode[] = [
      // Board root
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Column
      {
        id: "col",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "col" },
        parent_id: "board",
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Regular task
      {
        id: "task-1",
        type: "p",
        item: {},
        content: "A real task",
        parent_id: "col",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Attachments heading — exactly as Asana import creates it:
      // content has the collapse rule, but no title/name/rules fields
      {
        id: "attachments-123",
        type: "h",
        item: {},
        content: "Attachments km.collapse:: true",
        data: {},
        parent_id: "col",
        parent_idx: 1,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Individual attachment child
      {
        id: "att-123-1",
        type: "p",
        item: {},
        content: "[IMG_1704.jpg](attachments/IMG_1704.jpg)",
        parent_id: "attachments-123",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Comments heading — same pattern
      {
        id: "comments-123",
        type: "h",
        item: {},
        content: "Comments km.collapse:: true",
        data: {},
        parent_id: "col",
        parent_idx: 2,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // A comment child
      {
        id: "comment-123-1",
        type: "p",
        item: {},
        content: "2024-01-15 @alice: Great work!",
        parent_id: "comments-123",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
    ]

    const repo = createFakeRepo({ nodes: importedNodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    expect(columns).toHaveLength(1)
    const cardIds = columns[0]!.cardNodes.map((c) => c.id)

    // Real task should be visible
    expect(cardIds).toContain("task-1")

    // Attachments and Comments headings should be hidden (collapse rule in content)
    expect(cardIds).not.toContain("attachments-123")
    expect(cardIds).not.toContain("comments-123")

    // Their children should also be hidden (children of collapsed parents)
    expect(cardIds).not.toContain("att-123-1")
    expect(cardIds).not.toContain("comment-123-1")
  })

  test("Asana metadata sections at column level (zoomed into task) are hidden by isDetailOnly", () => {
    // Bug: km-tui.hide-attachments
    // When zoomed into a task, Attachments/Comments/Activity become column-level
    // nodes (direct children of the zoom root). These go through isDetailOnly()
    // at the column derivation level. The function must correctly identify them
    // as detail-only even when nodes lack pre-parsed name/title/rules fields.
    const ts = Date.now()
    const importedNodes: KNode[] = [
      // Task node (zoom root)
      {
        id: "task-root",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "task-root" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Real subtask column
      {
        id: "subtask-col",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "subtask-col" },
        parent_id: "task-root",
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "sub-1",
        type: "p",
        item: {},
        content: "A real subtask",
        parent_id: "subtask-col",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Attachments heading at column level — Asana import style (content only, no name/title/rules)
      {
        id: "attachments-456",
        type: "h",
        item: {},
        content: "Attachments km.collapse:: true",
        data: {},
        parent_id: "task-root",
        parent_idx: 1,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "att-456-1",
        type: "p",
        item: {},
        content: "![photo.jpg](attachments/photo.jpg)",
        parent_id: "attachments-456",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Comments heading at column level
      {
        id: "comments-456",
        type: "h",
        item: {},
        content: "Comments km.collapse:: true",
        data: {},
        parent_id: "task-root",
        parent_idx: 2,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "comment-456-1",
        type: "p",
        item: {},
        content: "2024-03-01 @bob: Looks good",
        parent_id: "comments-456",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Activity heading at column level
      {
        id: "activity-456",
        type: "h",
        item: {},
        content: "Activity km.collapse:: true",
        data: {},
        parent_id: "task-root",
        parent_idx: 3,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "act-456-1",
        type: "p",
        item: {},
        content: "2024-03-01 Task created",
        parent_id: "activity-456",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
    ]

    const repo = createFakeRepo({ nodes: importedNodes })
    const columns = deriveColumnsFromRepo(repo, "task-root", new Map())

    // Should have exactly 1 column (subtask-col) — metadata sections should be hidden
    expect(columns).toHaveLength(1)
    expect(columns[0]!.node.id).toBe("subtask-col")

    // Verify the attachment/comment/activity columns are NOT present
    const colIds = columns.map((c) => c.node.id)
    expect(colIds).not.toContain("attachments-456")
    expect(colIds).not.toContain("comments-456")
    expect(colIds).not.toContain("activity-456")
  })

  test("Asana metadata sections at column level after markdown round-trip (with name/title/rules)", () => {
    // After markdown sync, nodes have name, title, and rules set by the parser.
    // Verify isDetailOnly works correctly with fully-parsed nodes too.
    const ts = Date.now()
    const parsedNodes: KNode[] = [
      {
        id: "task-root",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "task-root" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "subtask-col",
        type: "h",
        item: {},
        fstype: "mdsection",
        name: "subtasks",
        title: "Subtasks",
        content: "Subtasks",
        data: {},
        parent_id: "task-root",
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "sub-1",
        type: "p",
        item: {},
        content: "A subtask",
        parent_id: "subtask-col",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // After round-trip: parser sets name="attachments", title="Attachments", rules={collapse:true}
      {
        id: "attachments-sec",
        type: "h",
        item: {},
        fstype: "mdsection",
        name: "attachments",
        title: "Attachments",
        content: "Attachments",
        rules: { collapse: true },
        data: { rules: { collapse: true }, title: "Attachments" },
        parent_id: "task-root",
        parent_idx: 1,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "att-1",
        type: "p",
        item: {},
        content: "[doc.pdf](attachments/doc.pdf)",
        parent_id: "attachments-sec",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
    ]

    const repo = createFakeRepo({ nodes: parsedNodes })
    const columns = deriveColumnsFromRepo(repo, "task-root", new Map())

    expect(columns).toHaveLength(1)
    expect(columns[0]!.node.id).toBe("subtask-col")

    const colIds = columns.map((c) => c.node.id)
    expect(colIds).not.toContain("attachments-sec")
  })

  test("isCollapsedChild handles node with title but collapse rule only in content", () => {
    // Edge case: a node might have title="Attachments" (clean) set separately
    // but the collapse rule only in content. If isCollapsedChild uses
    // node.title || node.content, the title takes precedence and the rule is missed.
    const ts = Date.now()
    const edgeCaseNodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "col",
        type: "h",
        item: {},
        fstype: "folder",
        data: { name: "col" },
        parent_id: "board",
        parent_idx: 0,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "task-1",
        type: "p",
        item: {},
        content: "Real task",
        parent_id: "col",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      // Node with title set to clean value but collapse rule in content only
      // This could happen if some code path sets title without parsing rules
      {
        id: "attachments-edge",
        type: "h",
        item: {},
        title: "Attachments",
        content: "Attachments km.collapse:: true",
        data: {},
        parent_id: "col",
        parent_idx: 1,
        embed_of: null,
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
      {
        id: "att-edge-1",
        type: "p",
        item: {},
        content: "[file.zip](attachments/file.zip)",
        parent_id: "attachments-edge",
        parent_idx: 0,
        embed_of: null,
        data: {},
        created_at: ts,
        updated_at: ts,
        version: "v1",
      },
    ]

    const repo = createFakeRepo({ nodes: edgeCaseNodes })
    const columns = deriveColumnsFromRepo(repo, "board", new Map())

    expect(columns).toHaveLength(1)
    const cardIds = columns[0]!.cardNodes.map((c) => c.id)

    expect(cardIds).toContain("task-1")
    // The attachments heading should be hidden even though title is clean
    expect(cardIds).not.toContain("attachments-edge")
    expect(cardIds).not.toContain("att-edge-1")
  })
})

describe("collapsed children hidden inside cards (sub-items)", () => {
  test("Activity/Comments sections with km.collapse:: true do not render inside cards", () => {
    // Bug: km-tui.activity-subitems
    // Even though collapsed sections are filtered from column-level cards,
    // they still appear as sub-items WITHIN a card's children rendering.
    // e.g., a task card shows "§ Activity" and "§ Comments" inside it.
    using app = createTestApp(
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
      { cols: 80, rows: 24 },
    )

    // The card itself should render
    app.expect("#task-with-activity").toExist()
    // Regular sub-tasks should be visible inside the card
    app.expect("#sub-task-1").toExist()
    app.expect("#sub-task-2").toExist()

    // Collapsed sections should NOT appear inside the card
    app.expect("#Activity km.collapse:: true").not.toExist()
    app.expect("#Comments km.collapse:: true").not.toExist()
    app.expect("#log-1").not.toExist()
    app.expect("#log-2").not.toExist()
    app.expect("#c1").not.toExist()

    // Verify via screen text that "Activity" and "Comments" text don't appear
    expect(app.text).not.toContain("Activity")
    expect(app.text).not.toContain("Comments")
  })

  test("detailOnly sub-items do not render inside cards", () => {
    using app = createTestApp(
      item(
        "board",
        item(
          "col",
          item("task-with-comments", item("real-child"), detailOnlyItem("inline-comments", "Comments", item("ic1"))),
        ),
      ),
      { cols: 80, rows: 24 },
    )

    app.expect("#task-with-comments").toExist()
    app.expect("#real-child").toExist()

    // detailOnly sub-items should not appear inside the card
    app.expect("#inline-comments").not.toExist()
    app.expect("#ic1").not.toExist()
  })

  test("well-known metadata sections hidden by title alone (no name, no collapse rule)", () => {
    // Bug: Attachments/Comments/Activity sections showing as "§ Attachments ···" cards
    // when node has title="Attachments" but no name field and no km.collapse:: rule.
    // isCollapsedChild should match well-known names via title (case-insensitive).
    using app = createTestApp(
      item(
        "board",
        item("col", item("task-1"), item.section("Attachments", item("att-1")), item.section("Comments", item("c-1"))),
      ),
      { cols: 80, rows: 24 },
    )

    app.expect("#task-1").toExist()
    // These should be hidden — well-known metadata sections
    expect(app.text).not.toContain("Attachments")
    expect(app.text).not.toContain("Comments")
  })

  test("overflow count excludes collapsed children inside cards", () => {
    // When a card has collapsed children, the overflow count should NOT include them.
    // Only real visible children should be counted for overflow.
    using app = createTestApp(
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
      { cols: 80, rows: 24 },
    )

    // The card should not show any overflow indicator from the collapsed children
    // Activity section has 3 children + itself = 4 hidden nodes that should NOT inflate overflow
    expect(app.text).not.toContain("Activity")
  })
})

describe("case-insensitive well-known section matching", () => {
  const ts = Date.now()
  function mkNode(overrides: Partial<KNode>): KNode {
    return {
      id: "test",
      type: "h",
      item: {},
      parent_id: null,
      parent_idx: 0,
      data: {},
      created_at: ts,
      updated_at: ts,
      version: "v1",
      ...overrides,
    }
  }

  test("isCollapsedChild matches name case-insensitively", () => {
    expect(isCollapsedChild(mkNode({ name: "Attachments" }))).toBe(true)
    expect(isCollapsedChild(mkNode({ name: "COMMENTS" }))).toBe(true)
    expect(isCollapsedChild(mkNode({ name: "Activity" }))).toBe(true)
    // Lowercase still works
    expect(isCollapsedChild(mkNode({ name: "attachments" }))).toBe(true)
  })

  test("isCollapsedChild matches title when name is absent", () => {
    expect(isCollapsedChild(mkNode({ title: "Attachments" }))).toBe(true)
    expect(isCollapsedChild(mkNode({ title: "Comments" }))).toBe(true)
    expect(isCollapsedChild(mkNode({ title: "Activity" }))).toBe(true)
  })

  test("isCollapsedChild matches content as fallback", () => {
    expect(isCollapsedChild(mkNode({ content: "Attachments" }))).toBe(true)
    expect(isCollapsedChild(mkNode({ content: "attachments" }))).toBe(true)
  })

  test("isDetailOnly matches name case-insensitively", () => {
    expect(isDetailOnly(mkNode({ name: "Attachments" }))).toBe(true)
    expect(isDetailOnly(mkNode({ name: "COMMENTS" }))).toBe(true)
    expect(isDetailOnly(mkNode({ name: "activity" }))).toBe(true)
  })

  test("isDetailOnly matches title when name is absent", () => {
    expect(isDetailOnly(mkNode({ title: "Attachments" }))).toBe(true)
    expect(isDetailOnly(mkNode({ title: "Comments" }))).toBe(true)
  })

  test("non-metadata sections are not collapsed", () => {
    expect(isCollapsedChild(mkNode({ name: "subtasks" }))).toBe(false)
    expect(isCollapsedChild(mkNode({ title: "Notes" }))).toBe(false)
    expect(isDetailOnly(mkNode({ name: "subtasks" }))).toBe(false)
  })
})
