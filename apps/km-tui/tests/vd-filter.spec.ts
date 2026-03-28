/**
 * Tests for the "vd" chord (toggle_hide_done) — Bug km-tui.vd-filter
 *
 * "vd doesn't hide tasks in @lio and #us (contexts/tags view)"
 *
 * The vd chord should hide done/dropped tasks at both:
 * 1. Card level (top-level items in columns) — filtered in Board.tsx filteredColumns
 * 2. Child level (items nested inside cards) — filtered in TreeNode.tsx
 *
 * For embed nodes (tag/assignee views), the filter must resolve embed_source
 * to the source node's task_status, since embed nodes don't carry task_status.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { item, testEnv } from "./helpers/board-test.ts"

describe("vd (toggle_hide_done)", () => {
  test("vd hides done tasks in a regular column", () => {
    const nodes = item("board", item("col1", item("todoTask"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.task_status = "done"
    doneNode.task_marker = "[x]"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    // Both tasks visible initially
    let screen = board.screenshot()
    expect(screen).toContain("todoTask")
    expect(screen).toContain("doneTask")

    // Press vd to hide done tasks
    board.command("toggle_hide_done")

    screen = board.screenshot()
    expect(screen).toContain("todoTask")
    expect(screen).not.toContain("doneTask")
  })

  test("vd hides done embed cards (tag/assignee view — card-level filter)", () => {
    // Simulate a tag view: column has embed nodes referencing source tasks.
    // These embeds are top-level cards, filtered by Board.tsx filteredColumns.
    const now = Date.now()

    const srcParent: KNode = {
      id: "src-parent",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "Sources" },
      parent_id: "board",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const todoSrc: KNode = {
      id: "todo-src",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "Todo source task",
      data: {},
      parent_id: "src-parent",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneSrc: KNode = {
      id: "done-src",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[x]",
      task_status: "done",
      content: "Done source task",
      data: {},
      parent_id: "src-parent",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const tagCol: KNode = {
      id: "tag-col",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "#us" },
      parent_id: "board",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // Embed nodes in the tag column (no task_status themselves)
    const todoEmbed: KNode = {
      id: "todo-embed",
      type: "p",
      item: true,
      list_marker: "-",
      content: "![[todo-src]]",
      data: {},
      parent_id: "tag-col",
      parent_idx: 0,
      embed_source: "todo-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneEmbed: KNode = {
      id: "done-embed",
      type: "p",
      item: true,
      list_marker: "-",
      content: "![[done-src]]",
      data: {},
      parent_id: "tag-col",
      parent_idx: 1,
      embed_source: "done-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const board_node: KNode = {
      id: "board",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const allNodes = [board_node, tagCol, todoEmbed, doneEmbed, srcParent, todoSrc, doneSrc]

    const { board } = testEnv(() => allNodes, {
      columns: 80,
      rows: 24,
      checkIncremental: false,
    })

    let screen = board.screenshot()
    expect(screen).toContain("Todo source task")
    expect(screen).toContain("Done source task")

    board.command("toggle_hide_done")

    screen = board.screenshot()
    expect(screen).toContain("Todo source task")
    expect(screen).not.toContain("Done source task")
  })

  test("vd hides done embed children within a card (tree-node-level filter)", () => {
    // Simulate a card with embed children: the card has a heading, and its
    // children are embed nodes referencing tasks. This is the TreeNode-level
    // filter path, which must also resolve embed_source for task_status.
    const now = Date.now()

    // Source nodes
    const todoSrc: KNode = {
      id: "todo-child-src",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "Todo child task",
      data: {},
      parent_id: "src-holder",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneSrc: KNode = {
      id: "done-child-src",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[x]",
      task_status: "done",
      content: "Done child task",
      data: {},
      parent_id: "src-holder",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const srcHolder: KNode = {
      id: "src-holder",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "Source Holder" },
      parent_id: "board",
      parent_idx: 1,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    // The card with embed children
    const cardNode: KNode = {
      id: "my-card",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "Parent card",
      data: {},
      parent_id: "col",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    // Embed children of the card
    const todoEmbedChild: KNode = {
      id: "todo-embed-child",
      type: "p",
      item: true,
      list_marker: "-",
      content: "![[todo-child-src]]",
      data: {},
      parent_id: "my-card",
      parent_idx: 0,
      embed_source: "todo-child-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const doneEmbedChild: KNode = {
      id: "done-embed-child",
      type: "p",
      item: true,
      list_marker: "-",
      content: "![[done-child-src]]",
      data: {},
      parent_id: "my-card",
      parent_idx: 1,
      embed_source: "done-child-src",
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const col: KNode = {
      id: "col",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "Tasks" },
      parent_id: "board",
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }
    const board_node: KNode = {
      id: "board",
      type: "h",
      item: true,
      fstype: "folder",
      content: undefined,
      data: { name: "board" },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      created_at: now,
      updated_at: now,
      version: "v1",
    }

    const allNodes = [board_node, col, cardNode, todoEmbedChild, doneEmbedChild, srcHolder, todoSrc, doneSrc]

    const { board } = testEnv(() => allNodes, {
      columns: 80,
      rows: 24,
      checkIncremental: false,
    })

    // Both children visible initially
    let screen = board.screenshot()
    expect(screen).toContain("Todo child task")
    expect(screen).toContain("Done child task")

    board.command("toggle_hide_done")

    screen = board.screenshot()
    // Todo embed child should remain
    expect(screen).toContain("Todo child task")
    // Done embed child should be hidden (its source is done)
    expect(screen).not.toContain("Done child task")
  })

  test("vd toggles back to show all tasks", () => {
    const nodes = item("board", item("col1", item("todoTask"), item("doneTask")))
    const doneNode = nodes.find((n) => n.id === "doneTask")!
    doneNode.task_status = "done"
    doneNode.task_marker = "[x]"

    const { board } = testEnv(() => nodes, { columns: 80, rows: 24 })

    board.command("toggle_hide_done")
    let screen = board.screenshot()
    expect(screen).not.toContain("doneTask")

    board.command("toggle_hide_done")
    screen = board.screenshot()
    expect(screen).toContain("todoTask")
    expect(screen).toContain("doneTask")
  })
})
