/**
 * HR content-based detection
 *
 * HR rendering should be based on the node's current content, not just its
 * parse-time type. This ensures that editing "---" to "---f" stops rendering
 * as an HR line and shows as a normal bordered card instead.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { stripAnsi } from "inkx"

/** Create an HR-typed node with custom content (simulates edited HR) */
function hrWithContent(id: string, content: string): KNode[] {
  const node: KNode = {
    id,
    type: "hr",
    content,
    data: {},
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  return [node]
}

describe("HR content-based detection", () => {
  const hrContents = ["---", "***", "___", "-----"] as const

  for (const content of hrContents) {
    test(`HR content '${content}' renders as line, no border when unselected`, () => {
      const { board } = testEnv(
        () => item("board", item("Col", hrWithContent("hr-node", content), item("other"))),
        { columns: 60, rows: 20 },
      )
      board.expectScreen("─")
      board.press("j")
      board.expectNodeNoBorder("hr-node")
    })
  }

  test("standard HR (type=hr, no content) renders as line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item.hr("my-hr"), item("other"))),
      { columns: 60, rows: 20 },
    )
    board.expectScreen("─")
    board.press("j")
    board.expectNodeNoBorder("my-hr")
  })

  const nonHrContents = [
    { content: "---f", label: "modified HR" },
    { content: "--- some text", label: "HR with trailing text" },
  ] as const

  for (const { content, label } of nonHrContents) {
    test(`${label} '${content}' does not render as HR line`, () => {
      const { board } = testEnv(
        () => item("board", item("Col", hrWithContent("edited-hr", content), item("other"))),
        { columns: 60, rows: 20 },
      )
      const text = stripAnsi(board.screenshot())
      expect(text).toContain(content)
      board.expectNodeBorder("edited-hr")
    })
  }
})
