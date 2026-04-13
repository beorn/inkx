/**
 * Tests for the "vd" chord (toggle_hide_done) — Bug km-tui.vd-filter
 *
 * "vd doesn't hide tasks in @lio and #us (contexts/tags view)"
 *
 * The vd chord should hide done/dropped tasks at both:
 * 1. Card level (top-level items in columns) — filtered in Board.tsx filteredColumns
 * 2. Child level (items nested inside cards) — filtered in TreeNode.tsx
 *
 * For embed nodes (tag/assignee views), the filter must resolve embed_of
 * to the source node's task_status, since embed nodes don't carry task_status.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

describe("vd (toggle_hide_done)", () => {
  test("vd hides done tasks in a regular column", () => {
    const nodes = item("board", item("col1", item("todoTask"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    // Both tasks visible initially
    app.expectScreen("todoTask")
    app.expectScreen("doneTask")

    // Press vd to hide done tasks
    app.command("toggle_hide_done")

    app.expectScreen("todoTask")
    app.expectScreenNot("doneTask")
  })

  test("vd hides done embed cards (tag/assignee view — card-level filter)", () => {
    // Simulate a tag view: column has embed nodes referencing source tasks.
    // These embeds are top-level cards, filtered by Board.tsx filteredColumns.
    const now = Date.now()

    const srcParent: KNode = {
      id: "src-parent",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "Sources" },
      parent_id: "board",
      parent_idx: 1,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const todoSrc: KNode = {
      id: "todo-src",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Todo source task",
      data: {},
      parent_id: "src-parent",
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneSrc: KNode = {
      id: "done-src",
      type: "p",
      item: { list: "-", task: { status: "done", marker: "[x]" } },
      content: "Done source task",
      data: {},
      parent_id: "src-parent",
      parent_idx: 1,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const tagCol: KNode = {
      id: "tag-col",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "#us" },
      parent_id: "board",
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Embed nodes in the tag column (no task_status themselves)
    const todoEmbed: KNode = {
      id: "todo-embed",
      type: "p",
      item: { list: "-" },
      content: "![[todo-src]]",
      data: {},
      parent_id: "tag-col",
      parent_idx: 0,
      embed_of: "todo-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneEmbed: KNode = {
      id: "done-embed",
      type: "p",
      item: { list: "-" },
      content: "![[done-src]]",
      data: {},
      parent_id: "tag-col",
      parent_idx: 1,
      embed_of: "done-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const board_node: KNode = {
      id: "board",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const allNodes = [board_node, tagCol, todoEmbed, doneEmbed, srcParent, todoSrc, doneSrc]

    using app = createTestApp(allNodes, {
      cols: 80,
      rows: 24,
      checkIncremental: false,
    })

    app.expectScreen("Todo source task")
    app.expectScreen("Done source task")

    app.command("toggle_hide_done")

    app.expectScreen("Todo source task")
    app.expectScreenNot("Done source task")
  })

  test("vd hides done embed children within a card (tree-node-level filter)", () => {
    // Simulate a card with embed children: the card has a heading, and its
    // children are embed nodes referencing tasks. This is the TreeNode-level
    // filter path, which must also resolve embed_of for task_status.
    const now = Date.now()

    // Source nodes
    const todoSrc: KNode = {
      id: "todo-child-src",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Todo child task",
      data: {},
      parent_id: "src-holder",
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneSrc: KNode = {
      id: "done-child-src",
      type: "p",
      item: { list: "-", task: { status: "done", marker: "[x]" } },
      content: "Done child task",
      data: {},
      parent_id: "src-holder",
      parent_idx: 1,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const srcHolder: KNode = {
      id: "src-holder",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "Source Holder" },
      parent_id: "board",
      parent_idx: 1,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // The card with embed children
    const cardNode: KNode = {
      id: "my-card",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      content: "Parent card",
      data: {},
      parent_id: "col",
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    // Embed children of the card
    const todoEmbedChild: KNode = {
      id: "todo-embed-child",
      type: "p",
      item: { list: "-" },
      content: "![[todo-child-src]]",
      data: {},
      parent_id: "my-card",
      parent_idx: 0,
      embed_of: "todo-child-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneEmbedChild: KNode = {
      id: "done-embed-child",
      type: "p",
      item: { list: "-" },
      content: "![[done-child-src]]",
      data: {},
      parent_id: "my-card",
      parent_idx: 1,
      embed_of: "done-child-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const col: KNode = {
      id: "col",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "Tasks" },
      parent_id: "board",
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const board_node: KNode = {
      id: "board",
      type: "h",
      item: {},
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      embed_of: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const allNodes = [board_node, col, cardNode, todoEmbedChild, doneEmbedChild, srcHolder, todoSrc, doneSrc]

    using app = createTestApp(allNodes, {
      cols: 80,
      rows: 24,
      checkIncremental: false,
    })

    // Both children visible initially
    app.expectScreen("Todo child task")
    app.expectScreen("Done child task")

    app.command("toggle_hide_done")

    // Todo embed child should remain
    app.expectScreen("Todo child task")
    // Done embed child should be hidden (its source is done)
    app.expectScreenNot("Done child task")
  })

  test("vd toggles back to show all tasks", () => {
    const nodes = item("board", item("col1", item("todoTask"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.item = { ...doneNode.item, task: { status: "done", marker: "[x]" } }

    using app = createTestApp(nodes, { cols: 80, rows: 24 })

    app.command("toggle_hide_done")
    app.expectScreenNot("doneTask")

    app.command("toggle_hide_done")
    app.expectScreen("todoTask")
    app.expectScreen("doneTask")
  })
})
