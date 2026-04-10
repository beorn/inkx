/**
 * Block reference resolution tests.
 *
 * The blockref model after cleanup:
 * - `^ID` at end of block = block identifier (metadata, stripped by kmBlockIdTransform, not rendered)
 * - `[[^ID]]` = blockref wikilink (the ONLY format that creates a visible cross-reference)
 * - `<^ID>` is NOT a valid format — angle brackets are for URLs only
 * - Unresolved wikilinks show target text dimmed
 */
import { describe, test, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { stripAnsi } from "@silvery/test"
import type { KNode } from "@km/core"
import { parseInlineText } from "../src/text/inline-parser.ts"

/** Create a standalone node with a specific ID and content (for resolution targets) */
function targetNode(id: string, content: string): KNode {
  return {
    id,
    type: "p",
    item: { list: "-", task: { status: "todo" as const, marker: "[ ]" } },
    content,
    data: {},
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

describe("blockref/wikilink resolution", () => {
  // --- ^ID = block identifier (metadata, not a link) ---

  test("parser: bare ^ID at end of text is stripped (block identifier, not a link)", () => {
    const nodes = parseInlineText("Task ^1201889996442258")
    // kmBlockIdTransform strips " ^ID", so only "Task" remains as plain text
    // No blockref node should be emitted — the ^ID is metadata
    const blockref = nodes.find((n) => n.type === "blockref")
    expect(blockref).toBeUndefined()
    const plainText = nodes
      .filter((n) => n.type === "plain")
      .map((n) => (n as { text: string }).text)
      .join("")
    expect(plainText).toBe("Task")
  })

  test("full board: bare ^ID is not rendered (block identifier is metadata)", () => {
    const nodes = item("board", item("col1", item("See ^1210156063601370")))
    nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
    using app = createTestApp(nodes, { rows: 20, cols: 80 })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    // Bare ^ID is metadata — stripped, NOT resolved as a link
    expect(text).toContain("See")
    expect(text).not.toContain("1210156063601370")
    // Should NOT resolve to target title (it's the block's OWN ID, not a reference)
    expect(text).not.toContain("Review quarterly budget")
  })

  // --- [[^ID]] = blockref wikilink (the only visible cross-reference format) ---

  test("parser: [[^nodeId]] creates wikilink with full target", () => {
    const nodes = parseInlineText("See [[^1210156063601370]]")
    const wikilink = nodes.find((n) => n.type === "wikilink")
    expect(wikilink).toBeDefined()
    if (wikilink?.type === "wikilink") {
      expect(wikilink.target).toBe("^1210156063601370")
    }
  })

  test("full board: [[^nodeId]] resolves to target title", () => {
    const nodes = item("board", item("col1", item("See [[^1210156063601370]]")))
    nodes.push(targetNode("1210156063601370", "Review quarterly budget"))
    using app = createTestApp(nodes, { rows: 20, cols: 80 })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    expect(text).toContain("Review quarterly budget")
    // Strip OSC 8 hyperlink sequences — the ID legitimately appears in the
    // hyperlink URL (km://wiki/^ID), but should not appear as visible text
    expect(stripAnsi(text)).not.toContain("1210156063601370")
  })

  test("full board: unresolved [[^ID]] shows target dimmed (not hidden)", () => {
    using app = createTestApp(item("board", item("col1", item("See [[^9999999999999999]]"))), {
      rows: 20,
      cols: 80,
    })

    const card = app.q("[data-cursor]")
    const text = card.textContent()
    // Unresolved wikilink still shows target text (dimmed, not green/underlined)
    expect(text).toContain("^9999999999999999")
  })

  // --- <^ID> is NOT a valid blockref format ---

  test("parser: <^ID> is not parsed as blockref (angle brackets are for URLs only)", () => {
    // After cleanup, <^ID> is not recognized. The angle brackets + caret are plain text.
    const nodes = parseInlineText("See <^1203717363310394>")
    const blockref = nodes.find((n) => n.type === "blockref")
    expect(blockref).toBeUndefined()
  })

  // --- Embed wikilinks ---

  test("parser: ![[^ID]] creates embed wikilink (handled by mdast, not inline patterns)", () => {
    const nodes = parseInlineText("See ![[^1201889996442258]]")
    const wikilink = nodes.find((n) => n.type === "wikilink")
    expect(wikilink).toBeDefined()
    if (wikilink?.type === "wikilink") {
      expect(wikilink.target).toBe("^1201889996442258")
      expect(wikilink.isEmbed).toBe(true)
    }
  })
})
