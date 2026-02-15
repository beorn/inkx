/**
 * Test: Hide redundant sigil/parent-context on embedded links
 *
 * Bead km-tui.hide-parent-sigil:
 * When viewing a board with an @next column containing embedded links,
 * the @next sigil should not show redundantly on cards that are
 * already inside the @next column.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"

describe("hide redundant parent sigil on embedded links", () => {
  /**
   * Build a board where:
   * - Board root is "board"
   * - Column "@next" contains embedded links (link_to) to tasks
   * - Tasks' original parent is a file called "@next.md"
   *   with display name "Next Actions" (via data.name)
   *
   * This tests the case where parentContext returns a display name
   * (like "Next Actions") that differs from the sigil ("@next").
   * The parent context should still be suppressed because the column
   * IS the @next column.
   */
  function buildEmbedBoard(options?: { parentDisplayName?: string }) {
    const parentName = options?.parentDisplayName ?? "@next"
    return testEnv(() => {
      const nodes = item(
        "board",
        item("@next", item("embed-a"), item("embed-b")),
        item("other-col", item("task-x")),
      )

      // Set up @next column as a sigil-named column
      for (const n of nodes) {
        if (n.id === "@next") {
          n.name = "@next"
          n.fs_path = "/fake/repo/@next.md"
        }
        // Set up embed nodes as links pointing to target tasks
        if (n.id === "embed-a") {
          n.type = "p"
          n.link_to = "target-a"
          n.task_status = undefined
          n.task_marker = undefined
          n.content = "![[target-a]]"
          n.data = {}
        }
        if (n.id === "embed-b") {
          n.type = "p"
          n.link_to = "target-b"
          n.task_status = undefined
          n.task_marker = undefined
          n.content = "![[target-b]]"
          n.data = {}
        }
      }

      // Add the "@next" mdfile node (parent of original tasks)
      // This represents the file where the tasks originally live
      nodes.push({
        id: "next-file",
        type: "oi",
        fstype: "mdfile",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: undefined,
        data: { name: parentName },
        name: "@next",
        fs_path: "/fake/repo/@next.md",
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)

      // Add the target task nodes (what the embeds point to)
      nodes.push({
        id: "target-a",
        type: "li",
        list_marker: "-",
        parent_id: "next-file",
        parent_idx: 0,
        link_to: null,
        task_status: "todo",
        task_marker: "[ ]",
        content: "Buy groceries",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)

      nodes.push({
        id: "target-b",
        type: "li",
        list_marker: "-",
        parent_id: "next-file",
        parent_idx: 1,
        link_to: null,
        task_status: "wip",
        task_marker: "[-]",
        content: "Write report @next",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode)

      return nodes
    })
  }

  test("embedded node does not show @next parent context inside @next column (sigil name match)", () => {
    // Parent file name matches column sigil exactly
    const { board } = buildEmbedBoard({ parentDisplayName: "@next" })
    const screenshot = board.screenshot()

    // The task content should be visible
    expect(screenshot).toContain("Buy groceries")

    // @next should NOT appear on card lines (already inside @next column)
    const lines = screenshot.split("\n")
    const cardLines = lines.filter((l) => l.includes("Buy groceries") || l.includes("Write report"))
    for (const line of cardLines) {
      expect(line).not.toContain("@next")
    }
  })

  test("parent context with display name 'Next Actions' is suppressed inside @next column", () => {
    // Parent file has display name "Next Actions" (not the sigil "@next")
    // The parent context should still be suppressed because it refers to the same column
    const { board } = buildEmbedBoard({ parentDisplayName: "Next Actions" })
    const screenshot = board.screenshot()

    // "Next Actions" should NOT appear as parent context on cards
    // inside the @next column — it's the same thing
    expect(screenshot).not.toContain("Next Actions")
  })

  test("sigil in task content is filtered out when inside matching column", () => {
    const { board } = buildEmbedBoard()
    const screenshot = board.screenshot()

    // "Write report @next" has @next in content — it should be stripped
    // because we're inside the @next column
    const writeLines = screenshot.split("\n").filter((l) => l.includes("Write report"))
    for (const line of writeLines) {
      expect(line).not.toContain("@next")
    }
  })

  test("@next column header still shows the sigil", () => {
    const { board } = buildEmbedBoard()
    const screenshot = board.screenshot()

    // The column header should still show @next
    const lines = screenshot.split("\n")
    const headerLine = lines.find((l) => l.includes("@next") && !l.includes("Buy") && !l.includes("Write"))
    expect(headerLine).toBeDefined()
  })
})
