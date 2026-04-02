import { describe, test, expect } from "vitest"
import { withTitle, withName, composePlugins, defaultNormalize, validateEffects } from "../src/board/normalize-plugins.ts"
import type { BoardEffect } from "../src/board/board-reducer.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Helpers
// =============================================================================

function makeUpdateEffect(nodeId: string, updates: Partial<KNode>): BoardEffect {
  return { type: "REPO_UPDATE_NODE", nodeId, updates }
}

function makeOutlineNode(id: string): KNode {
  return { id, type: "h", item: {}, parent_id: "root", parent_idx: 0, content: "Old", title: "Old", data: {}, created_at: 0, updated_at: 0, version: "" }
}

function makeListNode(id: string): KNode {
  return { id, type: "p", item: { list: "-" }, parent_id: "root", parent_idx: 0, content: "Old", title: "Old", data: {}, created_at: 0, updated_at: 0, version: "" }
}

// =============================================================================
// withTitle
// =============================================================================

describe("withTitle", () => {
  test("auto-sets title when content changes", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New heading" })]
    const result = withTitle(effects)
    expect(result[0]).toEqual(makeUpdateEffect("n1", { content: "New heading", title: "New heading" }))
  })

  test("does not override explicit title", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New", title: "Custom Title" })]
    const result = withTitle(effects)
    expect((result[0] as any).updates.title).toBe("Custom Title")
  })

  test("ignores effects without content change", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { name: "new-name" })]
    const result = withTitle(effects)
    expect((result[0] as any).updates.title).toBeUndefined()
  })

  test("ignores non-update effects", () => {
    const effects: BoardEffect[] = [{ type: "SELECT", nodeId: "n1" }]
    const result = withTitle(effects)
    expect(result).toEqual(effects)
  })
})

// =============================================================================
// withName
// =============================================================================

describe("withName", () => {
  test("auto-sets name for outline nodes when content changes", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New Section" })]
    const result = withName(effects, (id) => nodes.get(id) ?? null)
    expect((result[0] as any).updates.name).toBe("New Section")
  })

  test("content is always clean — no task marker stripping needed", () => {
    // Content never contains task markers (they're in item.task).
    // This test verifies name = content as-is for outline nodes.
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "Done Task" })]
    const result = withName(effects, (id) => nodes.get(id) ?? null)
    expect((result[0] as any).updates.name).toBe("Done Task")
  })

  test("does not set name for non-outline nodes", () => {
    const nodes = new Map([["n1", makeListNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "List item" })]
    const result = withName(effects, (id) => nodes.get(id) ?? null)
    expect((result[0] as any).updates.name).toBeUndefined()
  })

  test("does not override explicit name", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New", name: "custom-slug" })]
    const result = withName(effects, (id) => nodes.get(id) ?? null)
    expect((result[0] as any).updates.name).toBe("custom-slug")
  })

  test("no-ops without getNode", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New" })]
    const result = withName(effects)
    expect((result[0] as any).updates.name).toBeUndefined()
  })
})

// =============================================================================
// composePlugins
// =============================================================================

describe("composePlugins", () => {
  test("chains plugins left to right", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New Heading" })]
    const result = defaultNormalize(effects, (id) => nodes.get(id) ?? null)
    const update = result[0] as any
    expect(update.updates.content).toBe("New Heading")
    expect(update.updates.title).toBe("New Heading")
    expect(update.updates.name).toBe("New Heading")
  })
})

// =============================================================================
// validateEffects
// =============================================================================

describe("validateEffects", () => {
  test("throws when content set without title", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New" })]
    expect(() => validateEffects(effects)).toThrow("INVARIANT")
    expect(() => validateEffects(effects)).toThrow("sets content without title")
  })

  test("passes when both content and title set", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New", title: "New" })]
    expect(() => validateEffects(effects)).not.toThrow()
  })

  test("passes when only non-content fields updated", () => {
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { name: "slug" })]
    expect(() => validateEffects(effects)).not.toThrow()
  })

  test("throws when outline content set without name", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New", title: "New" })]
    expect(() => validateEffects(effects, (id) => nodes.get(id) ?? null)).toThrow("sets content without name")
  })

  test("passes when outline content + name + title all set", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New", title: "New", name: "New" })]
    expect(() => validateEffects(effects, (id) => nodes.get(id) ?? null)).not.toThrow()
  })

  test("after normalization pipeline, all invariants pass", () => {
    const nodes = new Map([["n1", makeOutlineNode("n1")]])
    const effects: BoardEffect[] = [makeUpdateEffect("n1", { content: "New" })]
    const normalized = defaultNormalize(effects, (id) => nodes.get(id) ?? null)
    expect(() => validateEffects(normalized, (id) => nodes.get(id) ?? null)).not.toThrow()
  })
})
