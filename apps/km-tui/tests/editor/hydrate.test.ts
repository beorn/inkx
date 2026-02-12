/**
 * Hydration Layer Tests
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { hydrateNode, dehydrateNode } from "../../src/editor/hydrate.ts"
import { descendantsToText } from "../../src/editor/schema.ts"

function makeNode(overrides: Partial<KNode>): KNode {
  return {
    id: "test-1",
    type: "task",
    parent_id: "parent",
    parent_idx: 0,
    link_to: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
    ...overrides,
  } as KNode
}

describe("hydrateNode", () => {
  test("hydrates task node (strips checkbox prefix)", () => {
    const node = makeNode({
      type: "task",
      content: "- [ ] Buy groceries",
      task_mark: " ",
    })
    const desc = hydrateNode(node)
    expect(descendantsToText(desc)).toBe("Buy groceries")
  })

  test("hydrates section node (uses name)", () => {
    const node = makeNode({
      type: "section",
      name: "My Section",
      content: "My Section",
    })
    const desc = hydrateNode(node)
    expect(descendantsToText(desc)).toBe("My Section")
  })

  test("hydrates paragraph node", () => {
    const node = makeNode({
      type: "paragraph",
      content: "Plain text paragraph",
    })
    const desc = hydrateNode(node)
    expect(descendantsToText(desc)).toBe("Plain text paragraph")
  })

  test("hydrates empty node", () => {
    const node = makeNode({ type: "task", content: "- [ ] " })
    const desc = hydrateNode(node)
    expect(descendantsToText(desc)).toBe("")
  })

  test("hydrates multiline content into paragraphs", () => {
    const node = makeNode({
      type: "paragraph",
      content: "First line\nSecond line",
    })
    const desc = hydrateNode(node)
    expect(desc).toHaveLength(2)
    expect(descendantsToText(desc)).toBe("First line\nSecond line")
  })
})

describe("dehydrateNode", () => {
  test("dehydrates to task content (adds checkbox prefix)", () => {
    const node = makeNode({ type: "task", task_mark: " " })
    const desc = [{ type: "paragraph" as const, children: [{ text: "Buy groceries" }] }]
    const content = dehydrateNode(node, desc)
    expect(content).toBe("- [ ] Buy groceries")
  })

  test("dehydrates to done task content", () => {
    const node = makeNode({ type: "task", task_mark: "x" })
    const desc = [{ type: "paragraph" as const, children: [{ text: "Done item" }] }]
    const content = dehydrateNode(node, desc)
    expect(content).toBe("- [x] Done item")
  })

  test("dehydrates to section content", () => {
    const node = makeNode({ type: "section" })
    const desc = [{ type: "paragraph" as const, children: [{ text: "Section Title" }] }]
    const content = dehydrateNode(node, desc)
    expect(content).toBe("Section Title")
  })

  test("round-trip preserves task content", () => {
    const node = makeNode({
      type: "task",
      content: "- [ ] Buy groceries",
      task_mark: " ",
    })
    const desc = hydrateNode(node)
    const content = dehydrateNode(node, desc)
    expect(content).toBe("- [ ] Buy groceries")
  })

  test("round-trip preserves section content", () => {
    const node = makeNode({
      type: "section",
      name: "My Section",
      content: "My Section",
    })
    const desc = hydrateNode(node)
    const content = dehydrateNode(node, desc)
    expect(content).toBe("My Section")
  })
})
