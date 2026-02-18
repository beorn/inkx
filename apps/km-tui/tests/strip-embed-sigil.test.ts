/**
 * Strip parent sigil from embedded node titles
 *
 * When viewing embedded nodes (transclusions with link_to), the sigil badge
 * after the title should be suppressed if it matches the board or column context.
 * E.g., a task with name "@next" displayed on the @next board should not show
 * the redundant "@next" sigil badge.
 *
 * Similarly, parent context (the "< source" line) should be suppressed if it
 * matches an excluded sigil.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { stripAnsi } from "inkx"

describe("strip embed sigil", () => {
  /**
   * Build a board with a @next column containing embedded tasks.
   * The target tasks have name: "@next" (simulating nodes from @next.md).
   */
  function boardWithEmbeddedSigils() {
    return testEnv(
      () => {
        const nodes = item(
          "board",
          item("@next", item("embed-a"), item("embed-b")),
          item("other", item("regular-task")),
        )

        for (const n of nodes) {
          // Make @next column a proper section
          if (n.id === "@next") {
            n.type = "oi"
            n.fstype = "mdsection"
            n.data = { depth: 2, name: "@next" }
            n.name = "@next"
          }

          // Make embed-a link to a target with name "@next"
          if (n.id === "embed-a") {
            n.type = "p"
            n.link_to = "target-a"
            n.content = "![[target-a]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }

          // Make embed-b link to a target with a different sigil
          if (n.id === "embed-b") {
            n.type = "p"
            n.link_to = "target-b"
            n.content = "![[target-b]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }

          // Make other column a section
          if (n.id === "other") {
            n.type = "oi"
            n.fstype = "mdsection"
            n.data = { depth: 2, name: "Other" }
          }
        }

        // Target A: task with name "@next" (sigil should be stripped in @next column)
        nodes.push({
          id: "target-a",
          type: "li",
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Buy groceries",
          name: "@next",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Target B: task with name "@waiting" (different sigil, should NOT be stripped in @next column)
        nodes.push({
          id: "target-b",
          type: "li",
          list_marker: "-",
          parent_id: "some-file",
          parent_idx: 1,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Wait for reply",
          name: "@waiting",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )
  }

  test("sigil badge is suppressed when it matches the column's excluded sigil", () => {
    const { board } = boardWithEmbeddedSigils()
    const text = stripAnsi(board.screenshot())

    // "@next" sigil badge should NOT appear after "Buy groceries" in the @next column
    // The task title "Buy groceries" should appear without a redundant "@next" suffix
    expect(text).toContain("Buy groceries")
    expect(text).not.toMatch(/Buy groceries\s+@next/)
  })

  test("sigil badge is shown when it does NOT match the column's excluded sigil", () => {
    const { board } = boardWithEmbeddedSigils()
    const text = stripAnsi(board.screenshot())

    // "@waiting" sigil badge SHOULD still appear after "Wait for reply"
    // because the column excludes @next, not @waiting
    expect(text).toContain("Wait for reply")
    expect(text).toMatch(/Wait for reply\s+@waiting/)
  })

  test("inline @next sigil in card content is stripped inside @next column", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("@next", item("task-a"), item("task-b")))

        for (const n of nodes) {
          if (n.id === "@next") {
            n.type = "oi"
            n.fstype = "mdsection"
            n.data = { depth: 2, name: "@next" }
            n.name = "@next"
          }
          // Tasks with @next inline in content
          if (n.id === "task-a") {
            n.content = "Buy groceries @next"
            n.name = "@next"
          }
          if (n.id === "task-b") {
            n.content = "Call dentist @next @urgent"
            n.name = "@next"
          }
        }

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())

    // Find card lines (contain □ marker) — skip top bar which shows full path
    const cardLines = text.split("\n").filter((l) => l.includes("□"))

    // Card with "Buy groceries" should NOT show @next
    const groceriesLine = cardLines.find((l) => l.includes("Buy groceries"))
    expect(groceriesLine).toBeDefined()
    expect(groceriesLine).not.toContain("@next")

    // Card with "Call dentist" should NOT show @next, but SHOULD show @urgent
    const dentistLine = cardLines.find((l) => l.includes("Call dentist"))
    expect(dentistLine).toBeDefined()
    expect(dentistLine).not.toContain("@next")
    expect(dentistLine).toContain("@urgent")
  })

  test("parent context is suppressed when it matches an excluded sigil", () => {
    // Build a board where embedded tasks come from a file named "@next"
    // The parent context would normally show "@next" but should be suppressed
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("@next", item("embed-c")))

        for (const n of nodes) {
          if (n.id === "@next") {
            n.type = "oi"
            n.fstype = "mdsection"
            n.data = { depth: 2, name: "@next" }
            n.name = "@next"
          }

          if (n.id === "embed-c") {
            n.type = "p"
            n.link_to = "target-c"
            n.content = "![[target-c]]"
            n.task_status = undefined
            n.task_marker = undefined
            n.data = {}
          }
        }

        // Create file node "@next" that is the parent of the target task
        nodes.push({
          id: "next-file",
          type: "oi",
          fstype: "mdfile",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          content: "",
          name: "@next",
          fs_path: "/vault/@next.md",
          data: { name: "@next" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        // Target task that lives inside @next.md — parent context would be "@next"
        nodes.push({
          id: "target-c",
          type: "li",
          list_marker: "-",
          parent_id: "next-file",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Call dentist",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)

        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())

    // Task content should be visible
    expect(text).toContain("Call dentist")
    // But "@next" as parent context should be suppressed (it's the column we're in)
    // In cards view, parent context appears as italic text above the title
    // In any case, "@next" should not appear as a context label near "Call dentist"
    const lines = text.split("\n")
    const taskLine = lines.findIndex((l) => l.includes("Call dentist"))
    if (taskLine > 0) {
      // The line above should NOT contain "@next" as parent context
      expect(lines[taskLine - 1]).not.toContain("@next")
    }
  })
})
