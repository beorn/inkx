/**
 * Exploration: Navigation among embeds — j/k through nodes with embeds,
 * heading depth < > changes
 *
 * Tests navigation through embed links and heading depth manipulation.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

describe("Exploration: Embed Navigation", () => {
  test("j/k navigation through mixed regular and embed nodes", () => {
    const { board } = testEnv(() => {
      const nodes = item(
        "board",
        item("col1", item("task1"), item("embed1"), item("task2"), item("embed2"), item("task3")),
      )
      // Set up embed nodes
      for (const n of nodes) {
        if (n.id === "embed1" || n.id === "embed2") {
          n.type = "paragraph"
          n.link_to = "target-" + n.id
          n.data = {}
        }
        if (n.id === "col1") {
          n.type = "section"
          n.data = { depth: 2 }
        }
      }
      // Add targets
      nodes.push({
        id: "target-embed1",
        type: "task",
        parent_id: "other",
        parent_idx: 0,
        link_to: null,
        task_status: "todo",
        task_mark: " ",
        content: "Embedded task 1",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)
      nodes.push({
        id: "target-embed2",
        type: "task",
        parent_id: "other",
        parent_idx: 1,
        link_to: null,
        task_status: "done",
        task_mark: "x",
        content: "Embedded task 2",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)
      return nodes
    })
    const bugs: string[] = []

    // Navigate through all items
    board.press("j") // → embed1
    board.press("j") // → task2
    board.press("j") // → embed2
    board.press("j") // → task3
    board.press("k") // → embed2
    board.press("k") // → task2
    board.press("k") // → embed1
    board.press("k") // → task1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage during j/k navigation through embeds")
    }
    expect(bugs).toEqual([])
  })

  test("heading depth < > on section nodes", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("A"), item("B")), item("col2", item("C")))
      // Make columns into sections with depth
      for (const n of nodes) {
        if (n.id === "col1") {
          n.type = "section"
          n.data = { depth: 2 }
        }
        if (n.id === "col2") {
          n.type = "section"
          n.data = { depth: 3 }
        }
      }
      return nodes
    })
    const bugs: string[] = []

    // Navigate to col1 header and try changing depth
    board.press("k") // col1 header

    board.press("<") // decrease depth
    board.press(">") // increase depth
    board.press(">") // increase again

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after heading depth changes")
    }
    expect(bugs).toEqual([])
  })

  test("x toggles task status on embed node", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("regular-task")))
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "paragraph"
          n.link_to = "target-a"
          n.data = {}
        }
        if (n.id === "regular-task") {
          n.type = "task"
          n.task_status = "todo"
          n.task_mark = " "
        }
        if (n.id === "col1") {
          n.type = "section"
          n.data = { depth: 2 }
        }
      }
      nodes.push({
        id: "target-a",
        type: "task",
        parent_id: "other",
        parent_idx: 0,
        link_to: null,
        task_status: "todo",
        task_mark: " ",
        content: "Target task A",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)
      return nodes
    })
    const bugs: string[] = []

    // Cursor on embed-a, toggle status
    board.press("x")

    const targetStatus = repo.getNode("target-a")?.task_status
    if (targetStatus === "todo") {
      bugs.push("x on embed didn't toggle target task status")
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after x on embed node")
    }
    expect(bugs).toEqual([])
  })

  test("navigation to embed then zoom in", () => {
    const { board } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("B")))
      for (const n of nodes) {
        if (n.id === "embed-a") {
          n.type = "paragraph"
          n.link_to = "target-a"
          n.data = {}
        }
        if (n.id === "col1") {
          n.type = "section"
          n.data = { depth: 2 }
        }
      }
      nodes.push({
        id: "target-a",
        type: "task",
        parent_id: "other",
        parent_idx: 0,
        link_to: null,
        content: "Target task A",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)
      return nodes
    })
    const bugs: string[] = []

    // Try zoom into embed — it's a leaf link, should open detail or do nothing gracefully
    board.press("i")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom on embed node")
    }
    expect(bugs).toEqual([])
  })

  test("rapid j/k through many items with embeds", () => {
    const { board } = testEnv(() => {
      const nodes = item(
        "board",
        item("col1", item("t1"), item("e1"), item("t2"), item("e2"), item("t3"), item("e3"), item("t4"), item("e4")),
      )
      for (const n of nodes) {
        if (n.id.startsWith("e")) {
          n.type = "paragraph"
          n.link_to = "target-" + n.id
          n.data = {}
        }
        if (n.id === "col1") {
          n.type = "section"
          n.data = { depth: 2 }
        }
      }
      // Add targets for all embeds
      for (let i = 1; i <= 4; i++) {
        nodes.push({
          id: `target-e${i}`,
          type: "task",
          parent_id: "other",
          parent_idx: i,
          link_to: null,
          content: `Target ${i}`,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)
      }
      return nodes
    })
    const bugs: string[] = []

    // Navigate all the way down
    for (let i = 0; i < 7; i++) board.press("j")
    // Navigate all the way back up
    for (let i = 0; i < 7; i++) board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid navigation through embeds")
    }
    expect(bugs).toEqual([])
  })
})
