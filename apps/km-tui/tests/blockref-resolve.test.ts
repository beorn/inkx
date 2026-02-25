/**
 * Regression: km-tui.raw-id-tasks
 *
 * Block references (^numericId) and wikilinks ([[^nodeId]]) should resolve
 * to target node titles when possible, rather than showing raw IDs.
 * Unresolved blockrefs should be hidden; unresolved wikilinks should be dimmed.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { parseInlineText } from "../src/text/inline-parser.ts"

/** Create a standalone node with a specific ID and content (for resolution targets) */
function targetNode(id: string, content: string): KNode {
  return {
    id,
    type: "p",
    item: true,
    list_marker: "-",
    task_marker: "[ ]",
    task_status: "todo" as const,
    content,
    data: {},
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

describe("blockref/wikilink resolution", () => {
  test("parser: standalone ^blockref preserved as blockref node", () => {
    const nodes = parseInlineText("See ^1210156063601370")
    const blockref = nodes.find((n) => n.type === "blockref")
    expect(blockref).toBeDefined()
    if (blockref && blockref.type === "blockref") {
      expect(blockref.id).toBe("1210156063601370")
    }
  })

  test("parser: [[^nodeId]] creates wikilink with full target", () => {
    const nodes = parseInlineText("See [[^1210156063601370]]")
    const wikilink = nodes.find((n) => n.type === "wikilink")
    expect(wikilink).toBeDefined()
    if (wikilink && wikilink.type === "wikilink") {
      expect(wikilink.target).toBe("^1210156063601370")
    }
  })

  test("full board: standalone blockref resolves to target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("col1", item("See ^1210156063601370")),
        )
        nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
        return nodes
      },
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Review quarterly budget")
    expect(text).not.toContain("1210156063601370")
  })

  test("full board: standalone blockref hidden when unresolved", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("See ^1210156063601370 notes"))),
      { rows: 20, columns: 60 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("1210156063601370")
    expect(text).toContain("See")
    expect(text).toContain("notes")
  })

  test("full board: wikilink [[^nodeId]] resolves to target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item(
          "board",
          item("col1", item("See [[^1210156063601370]]")),
        )
        nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
        return nodes
      },
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Review quarterly budget")
    expect(text).not.toContain("1210156063601370")
  })

  test("full board: unresolved wikilink shows target dimmed (not hidden)", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("See [[^9999999999999999]]"))),
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    // Unresolved wikilink still shows target text (dimmed, not green/underlined)
    expect(text).toContain("^9999999999999999")
  })
})
