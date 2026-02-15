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
  test("standard HR (type=hr, no content) renders as line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", item.hr("my-hr"))),
      { columns: 60, rows: 20 },
    )
    // HR should render with ─ characters
    board.expectScreen("─")
    // HR should not have a card border
    board.expectNodeNoBorder("my-hr")
  })

  test("modified HR content '---f' does not render as HR line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("edited-hr", "---f"))),
      { columns: 60, rows: 20 },
    )
    // With "---f" content (type="hr" from parse time), it should NOT render
    // as an HR line — it should render as a normal bordered card
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("---f")
    // Should have a card border since it's not rendering as HR
    board.expectNodeBorder("edited-hr")
  })

  test("three dashes content renders as HR", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("hr-dashes", "---"))),
      { columns: 60, rows: 20 },
    )
    board.expectScreen("─")
    board.expectNodeNoBorder("hr-dashes")
  })

  test("asterisk HR (***) content renders as HR line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("hr-stars", "***"))),
      { columns: 60, rows: 20 },
    )
    board.expectScreen("─")
    board.expectNodeNoBorder("hr-stars")
  })

  test("underscore HR (___) content renders as HR line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("hr-under", "___"))),
      { columns: 60, rows: 20 },
    )
    board.expectScreen("─")
    board.expectNodeNoBorder("hr-under")
  })

  test("extended dashes (-----) still renders as HR", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("hr-long", "-----"))),
      { columns: 60, rows: 20 },
    )
    board.expectScreen("─")
    board.expectNodeNoBorder("hr-long")
  })

  test("HR with trailing text does not render as line", () => {
    const { board } = testEnv(
      () => item("board", item("Col", hrWithContent("hr-text", "--- some text"))),
      { columns: 60, rows: 20 },
    )
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("--- some text")
    board.expectNodeBorder("hr-text")
  })
})
