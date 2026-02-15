/**
 * Regression check: km-tui.embed-display
 *
 * Embedded links should display correctly without ! prefix or [[ ]] syntax.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"
import type { KNode } from "@km/core"

describe("embed display regression (km-tui.embed-display)", () => {
  test("unresolved embed with link_to=null does not show ! prefix", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular")))
        nodes.push({
          id: "embed1",
          type: "p" as const,
          content: "![[SomeFile.pdf]]",
          link_to: null,
          parent_id: "col1",
          parent_idx: 1,
          data: { embeddingTarget: "SomeFile.pdf" },
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)
        return nodes
      },
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("SomeFile.pdf")
    expect(text).not.toContain("!SomeFile")
    expect(text).not.toContain("![[")
  })

  test("resolved embed shows target content", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("regular")))
        nodes.push({
          id: "target",
          type: "li" as const,
          list_marker: "-",
          parent_id: "other",
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          task_marker: "[ ]",
          content: "Resolved content here",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        } as KNode)
        nodes.push({
          id: "embed2",
          type: "p" as const,
          content: "![[target]]",
          link_to: "target",
          parent_id: "col1",
          parent_idx: 1,
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
    expect(text).toContain("Resolved content here")
    expect(text).not.toContain("![[")
  })
})
