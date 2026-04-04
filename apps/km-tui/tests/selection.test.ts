/**
 * Selection namespace unit tests.
 *
 * Uses mock context — no testEnv/repo needed.
 */

import { describe, expect, test, vi } from "vitest"
import { type SelectionCtx, type BatchCtx, type MoveCtx, Selection } from "../src/state/selection.ts"
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
  cursorNodeId?: string | null
  multiSelected?: Set<string>
  nodeIndex?: Map<string, { colIndex: number; cardIndex: number }>
  extraNodes?: Map<string, KNode>
}): SelectionCtx {
  const cards = opts.cards ?? []
  const cardIndex = opts.cardIndex ?? 0
  const nodeIndex =
    opts.nodeIndex ?? new Map(cards.map((c, i) => [c.id, { colIndex: opts.colIndex ?? 0, cardIndex: i }]))
  const allNodes = new Map(cards.map((c) => [c.id, c]))
  if (opts.extraNodes) {
    for (const [k, v] of opts.extraNodes) allNodes.set(k, v)
  }

  return {
    selectedIds: opts.multiSelected ?? new Set(),
    columns: [{ cardNodes: cards }],
    cursorNodeId: opts.cursorNodeId ?? cards[cardIndex]?.id ?? null,
    colIndex: opts.colIndex ?? 0,
    cardIndex,
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

  test("returns empty array when no cursor node", () => {
    const ctx = mockCtx({ cards: [], cardIndex: 0, cursorNodeId: null })
    expect(Selection.nodes(ctx)).toEqual([])
  })

  test("returns column heading node when cardIndex is -1", () => {
    const col = makeNode("col-heading")
    const ctx = mockCtx({
      cards: [],
      cardIndex: -1,
      cursorNodeId: "col-heading",
      extraNodes: new Map([["col-heading", col]]),
    })
    expect(Selection.nodes(ctx)).toEqual([col])
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

// =============================================================================
// Mock helpers for batch/move contexts
// =============================================================================

function mockUndoHandle() {
  return {
    setCursor: vi.fn(),
    startBatch: vi.fn(),
    endBatch: vi.fn(),
  }
}

function mockBatchCtx(opts: Parameters<typeof mockCtx>[0] & { cursorNodeId?: string | null }): BatchCtx {
  const base = mockCtx(opts)
  return {
    ...base,
    cursorNodeId: opts.cursorNodeId !== undefined ? opts.cursorNodeId : base.cursorNodeId,
    undoHandle: mockUndoHandle(),
  }
}

function mockMoveCtx(
  opts: Parameters<typeof mockCtx>[0] & {
    cursorNodeId?: string | null
    children?: Map<string | null, { id: string; parent_idx: number }[]>
  },
): MoveCtx {
  const children = opts.children ?? new Map()
  const base = mockCtx(opts)
  return {
    ...base,
    cursorNodeId: opts.cursorNodeId !== undefined ? opts.cursorNodeId : base.cursorNodeId,
    undoHandle: mockUndoHandle(),
    repo: {
      ...base.repo,
      moveNode: vi.fn(),
      getChildren: (parentId: string | null) => children.get(parentId) ?? [],
    },
  }
}

// =============================================================================
// Selection.moveTo tests
// =============================================================================

describe("Selection.moveTo", () => {
  test("returns { moved: 0 } when no selection", () => {
    const ctx = mockMoveCtx({ cards: [], cardIndex: 0 })
    const result = Selection.moveTo(ctx, { parentId: "target", childIdx: -1 })
    expect(result).toEqual({ moved: 0 })
  })

  test("moves selected nodes and returns count", () => {
    const a = makeNode("a", "old")
    const b = makeNode("b", "old")
    const ctx = mockMoveCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
      children: new Map([["target", []]]),
    })

    const result = Selection.moveTo(ctx, { parentId: "target", childIdx: -1 })
    // Tree.moveTo returns true for actual moves
    expect(result.moved).toBe(2)
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a") // cursor node
    expect(ctx.undoHandle.startBatch).toHaveBeenCalledWith("Move")
    expect(ctx.undoHandle.endBatch).toHaveBeenCalledTimes(1)
  })

  test("skips self-move (card.id === to.parentId)", () => {
    const a = makeNode("a", "old")
    const b = makeNode("b", "old")
    const ctx = mockMoveCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
      children: new Map([["a", []]]),
    })

    const result = Selection.moveTo(ctx, { parentId: "a", childIdx: -1 })
    // "a" is skipped (self-move), only "b" is moved
    expect(result.moved).toBe(1)
  })

  test("sets cursor before batch", () => {
    const a = makeNode("a", "old")
    const ctx = mockMoveCtx({
      cards: [a],
      cardIndex: 0,
      cursorNodeId: "a",
      children: new Map([["target", []]]),
    })

    Selection.moveTo(ctx, { parentId: "target", childIdx: -1 })
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a")
  })
})

// =============================================================================
// Selection.forEach tests
// =============================================================================

describe("Selection.forEach", () => {
  test("calls fn for each node", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockBatchCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    const visited: string[] = []
    const count = Selection.forEach(ctx, "Test", (n) => visited.push(n.id))

    expect(count).toBe(2)
    expect(visited).toEqual(["a", "b"])
  })

  test("wraps in batch when >1 node", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockBatchCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    Selection.forEach(ctx, "Batch op", (_n) => {})

    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a") // cursor node
    expect(ctx.undoHandle.startBatch).toHaveBeenCalledWith("Batch op")
    expect(ctx.undoHandle.endBatch).toHaveBeenCalledTimes(1)
  })

  test("does not batch for single node", () => {
    const a = makeNode("a")
    const ctx = mockBatchCtx({
      cards: [a],
      cardIndex: 0,
    })

    const visited: string[] = []
    const count = Selection.forEach(ctx, "Single", (n) => visited.push(n.id))

    expect(count).toBe(1)
    expect(visited).toEqual(["a"])
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a") // cursor node
    expect(ctx.undoHandle.startBatch).not.toHaveBeenCalled()
    expect(ctx.undoHandle.endBatch).not.toHaveBeenCalled()
  })

  test("returns 0 when no selection", () => {
    const ctx = mockBatchCtx({ cards: [], cardIndex: 0 })

    const fn = vi.fn()
    const count = Selection.forEach(ctx, "Empty", fn)

    expect(count).toBe(0)
    expect(fn).not.toHaveBeenCalled()
  })
})
