/**
 * Selection namespace unit tests.
 *
 * Uses mock context — no testEnv/repo needed.
 */

import { describe, expect, test } from "vitest"
import { type SelectionCtx, Selection } from "../src/selection.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Mock helpers
// =============================================================================

function makeNode(id: string, parentId?: string): KNode {
  return {
    id,
    parent_id: parentId ?? null,
    parent_idx: 0,
    type: "p",
    content: id,
  } as KNode
}

function mockCtx(opts: {
  cards?: KNode[]
  colIndex?: number
  cardIndex?: number
  multiSelected?: Set<string>
  nodeIndex?: Map<string, { colIndex: number; cardIndex: number }>
  extraNodes?: Map<string, KNode>
}): SelectionCtx {
  const cards = opts.cards ?? []
  const nodeIndex =
    opts.nodeIndex ?? new Map(cards.map((c, i) => [c.id, { colIndex: opts.colIndex ?? 0, cardIndex: i }]))
  const allNodes = new Map(cards.map((c) => [c.id, c]))
  if (opts.extraNodes) {
    for (const [k, v] of opts.extraNodes) allNodes.set(k, v)
  }

  return {
    ui: { multiSelected: opts.multiSelected ?? new Set() },
    columns: [{ cardNodes: cards }],
    colIndex: opts.colIndex ?? 0,
    cardIndex: opts.cardIndex ?? 0,
    nodeIndex,
    repo: { getNode: (id: string) => allNodes.get(id) ?? null },
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("Selection.nodes", () => {
  test("returns cursor card when nothing selected", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({ cards: [a, b], cardIndex: 1 })

    const result = Selection.nodes(ctx)
    expect(result).toEqual([b])
  })

  test("returns selected cards when multi-selected", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const c = makeNode("c")
    const ctx = mockCtx({
      cards: [a, b, c],
      cardIndex: 0,
      multiSelected: new Set(["a", "c"]),
    })

    const result = Selection.nodes(ctx)
    expect(result.map((n) => n.id)).toEqual(["a", "c"])
  })

  test("returns empty array when no column/cursor card", () => {
    const ctx = mockCtx({ cards: [], cardIndex: 0 })
    expect(Selection.nodes(ctx)).toEqual([])
  })

  test("returns cursor card even with 1-item selection (same as cursor)", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    // multiSelected has one entry matching cardIndex=0
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a"]),
    })

    // cardIndices returns [0] which is length 1, so falls through to cursor card
    const result = Selection.nodes(ctx)
    expect(result).toEqual([a])
  })
})

describe("Selection.nodeIds", () => {
  test("returns IDs of selected nodes", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    expect(Selection.nodeIds(ctx)).toEqual(["a", "b"])
  })

  test("returns cursor card ID when nothing selected", () => {
    const a = makeNode("a")
    const ctx = mockCtx({ cards: [a], cardIndex: 0 })
    expect(Selection.nodeIds(ctx)).toEqual(["a"])
  })
})

describe("Selection.cardIndices", () => {
  test("returns empty when nothing selected", () => {
    const a = makeNode("a")
    const ctx = mockCtx({ cards: [a], cardIndex: 0 })
    expect(Selection.cardIndices(ctx)).toEqual([])
  })

  test("returns sorted indices for selected cards", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const c = makeNode("c")
    const ctx = mockCtx({
      cards: [a, b, c],
      cardIndex: 0,
      multiSelected: new Set(["c", "a"]),
    })

    expect(Selection.cardIndices(ctx)).toEqual([0, 2])
  })

  test("resolves sub-items via parent chain", () => {
    const card = makeNode("card")
    const child = makeNode("child", "card")
    const ctx = mockCtx({
      cards: [card],
      cardIndex: 0,
      multiSelected: new Set(["child"]),
      extraNodes: new Map([["child", child]]),
    })

    // child's parent "card" is at cardIndex 0
    expect(Selection.cardIndices(ctx)).toEqual([0])
  })
})

describe("Selection.isEmpty", () => {
  test("true when multiSelected is empty", () => {
    const ctx = mockCtx({ cards: [makeNode("a")], cardIndex: 0 })
    expect(Selection.isEmpty(ctx)).toBe(true)
  })

  test("false when multiSelected has entries", () => {
    const ctx = mockCtx({
      cards: [makeNode("a")],
      cardIndex: 0,
      multiSelected: new Set(["a"]),
    })
    expect(Selection.isEmpty(ctx)).toBe(false)
  })
})

describe("Selection.contains", () => {
  test("true for selected node", () => {
    const ctx = mockCtx({
      cards: [makeNode("a")],
      cardIndex: 0,
      multiSelected: new Set(["a"]),
    })
    expect(Selection.contains(ctx, "a")).toBe(true)
  })

  test("false for unselected node", () => {
    const ctx = mockCtx({
      cards: [makeNode("a")],
      cardIndex: 0,
      multiSelected: new Set(["a"]),
    })
    expect(Selection.contains(ctx, "b")).toBe(false)
  })

  test("false when nothing selected", () => {
    const ctx = mockCtx({ cards: [makeNode("a")], cardIndex: 0 })
    expect(Selection.contains(ctx, "a")).toBe(false)
  })
})
