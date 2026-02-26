/**
 * Regression: km-tui.raw-id-tasks, km-tui.bare-ids-still
 *
 * Block references (^numericId), angle-bracket refs (<^numericId>), and
 * wikilinks ([[^nodeId]]) should resolve to target node titles when possible,
 * rather than showing raw IDs.
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
    if (blockref?.type === "blockref") {
      expect(blockref.id).toBe("1210156063601370")
    }
  })

  test("parser: [[^nodeId]] creates wikilink with full target", () => {
    const nodes = parseInlineText("See [[^1210156063601370]]")
    const wikilink = nodes.find((n) => n.type === "wikilink")
    expect(wikilink).toBeDefined()
    if (wikilink?.type === "wikilink") {
      expect(wikilink.target).toBe("^1210156063601370")
    }
  })

  test("full board: standalone blockref resolves to target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("See ^1210156063601370")))
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
    const { board } = testEnv(() => item("board", item("col1", item("See ^1210156063601370 notes"))), {
      rows: 20,
      columns: 60,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("1210156063601370")
    expect(text).toContain("See")
    expect(text).toContain("notes")
  })

  test("full board: wikilink [[^nodeId]] resolves to target title", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("See [[^1210156063601370]]")))
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
    const { board } = testEnv(() => item("board", item("col1", item("See [[^9999999999999999]]"))), {
      rows: 20,
      columns: 80,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    // Unresolved wikilink still shows target text (dimmed, not green/underlined)
    expect(text).toContain("^9999999999999999")
  })

  // --- km-tui.bare-ids-still regression tests ---

  test("parser: <^numericId> parsed as single blockref (no angle brackets)", () => {
    const nodes = parseInlineText("See <^1203717363310394>")
    const blockref = nodes.find((n) => n.type === "blockref")
    expect(blockref).toBeDefined()
    if (blockref?.type === "blockref") {
      expect(blockref.id).toBe("1203717363310394")
    }
    // Angle brackets should NOT appear as plain text
    const plainTexts = nodes
      .filter((n) => n.type === "plain")
      .map((n) => (n as { text: string }).text)
      .join("")
    expect(plainTexts).not.toContain("<")
    expect(plainTexts).not.toContain(">")
  })

  test("parser: bare ^ID at end of line has separating space", () => {
    const nodes = parseInlineText("See ^1210156063601370")
    // Should be: plain("See"), plain(" "), blockref
    const types = nodes.map((n) => n.type)
    expect(types).toContain("blockref")
    // When flattened, there should be a space before the blockref position
    const plainTexts = nodes
      .filter((n) => n.type === "plain")
      .map((n) => (n as { text: string }).text)
      .join("")
    expect(plainTexts).toBe("See ")
  })

  test("full board: <^ID> resolves to target title without angle brackets", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("See <^1210156063601370>")))
        nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
        return nodes
      },
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Review quarterly budget")
    expect(text).not.toContain("1210156063601370")
    expect(text).not.toContain("<")
    expect(text).not.toContain(">")
  })

  test("full board: <^ID> hidden when unresolved (no angle brackets)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("See <^1210156063601370>"))), {
      rows: 20,
      columns: 80,
    })

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    expect(text).not.toContain("1210156063601370")
    expect(text).not.toContain("<")
    expect(text).not.toContain(">")
    expect(text).toContain("See")
  })

  test("full board: resolved blockref has proper spacing", () => {
    const { board } = testEnv(
      () => {
        const nodes = item("board", item("col1", item("See ^1210156063601370")))
        nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
        return nodes
      },
      { rows: 20, columns: 80 },
    )

    const card = board.q("[data-cursor]")
    const text = card.textContent()
    // Should have a space between "See" and resolved title
    expect(text).toContain("See Review quarterly budget")
  })
})
