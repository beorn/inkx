/**
 * Board selection helper unit tests.
 *
 * Uses mock context — no testEnv/repo needed.
 */

import { describe, expect, test, vi } from "vitest"
import {
  getSelectedCardIndices,
  getSelectedNodes,
  getSelectedNodeIds,
  moveSelectedTo,
  forEachSelected,
} from "../src/board/board-selection-helpers.ts"
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

function mockUndoHandle() {
  return {
    setCursor: vi.fn(),
    startBatch: vi.fn(),
    endBatch: vi.fn(),
  }
}

/** Build a minimal mock with only the fields selection helpers need. */
function mockCtx(opts: {
  cards?: KNode[]
  colIndex?: number
  cardIndex?: number
  cursor?: string | null
  multiSelected?: Set<string>
  nodeIndex?: Map<string, { colIndex: number; cardIndex: number }>
  extraNodes?: Map<string, KNode>
  children?: Map<string | null, { id: string; parent_idx: number }[]>
  withMoveNode?: boolean
}) {
  const cards = opts.cards ?? []
  const cardIndex = opts.cardIndex ?? 0
  const nodeIndex =
    opts.nodeIndex ?? new Map(cards.map((c, i) => [c.id, { colIndex: opts.colIndex ?? 0, cardIndex: i }]))
  const allNodes = new Map(cards.map((c) => [c.id, c]))
  if (opts.extraNodes) {
    for (const [k, v] of opts.extraNodes) allNodes.set(k, v)
  }
  const children = opts.children ?? new Map()

  // Cast to any — these tests only exercise the selection helpers which
  // only read the fields we provide here.
  const cursor = opts.cursor ?? cards[cardIndex]?.id ?? null
  return {
    selectedIds: opts.multiSelected ?? new Set(),
    columns: [{ cardNodes: cards }],
    cursor,
    sel: { node: { cursor: () => cursor, ids: () => [], select: () => {} } },
    colIndex: opts.colIndex ?? 0,
    cardIndex,
    nodeIndex,
    repo: {
      getNode: (id: string) => allNodes.get(id) ?? null,
      ...(opts.withMoveNode ? { moveNode: vi.fn() } : {}),
      ...(opts.children ? { getChildren: (parentId: string | null) => children.get(parentId) ?? [] } : {}),
    },
    undoHandle: mockUndoHandle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

// =============================================================================
// Tests
// =============================================================================

describe("getSelectedNodes", () => {
  test("returns cursor card when nothing selected", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({ cards: [a, b], cardIndex: 1 })

    const result = getSelectedNodes(ctx)
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

    const result = getSelectedNodes(ctx)
    expect(result.map((n: KNode) => n.id)).toEqual(["a", "c"])
  })

  test("returns empty array when no cursor node", () => {
    const ctx = mockCtx({ cards: [], cardIndex: 0, cursor: null })
    expect(getSelectedNodes(ctx)).toEqual([])
  })

  test("returns column heading node when cardIndex is -1", () => {
    const col = makeNode("col-heading")
    const ctx = mockCtx({
      cards: [],
      cardIndex: -1,
      cursor: "col-heading",
      extraNodes: new Map([["col-heading", col]]),
    })
    expect(getSelectedNodes(ctx)).toEqual([col])
  })

  test("returns cursor card even with 1-item selection (same as cursor)", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a"]),
    })

    const result = getSelectedNodes(ctx)
    expect(result).toEqual([a])
  })
})

describe("getSelectedNodeIds", () => {
  test("returns IDs of selected nodes", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    expect(getSelectedNodeIds(ctx)).toEqual(["a", "b"])
  })

  test("returns cursor card ID when nothing selected", () => {
    const a = makeNode("a")
    const ctx = mockCtx({ cards: [a], cardIndex: 0 })
    expect(getSelectedNodeIds(ctx)).toEqual(["a"])
  })
})

describe("getSelectedCardIndices", () => {
  test("returns empty when nothing selected", () => {
    const a = makeNode("a")
    const ctx = mockCtx({ cards: [a], cardIndex: 0 })
    expect(getSelectedCardIndices(ctx)).toEqual([])
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

    expect(getSelectedCardIndices(ctx)).toEqual([0, 2])
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

    expect(getSelectedCardIndices(ctx)).toEqual([0])
  })
})

// =============================================================================
// moveSelectedTo tests
// =============================================================================

describe("moveSelectedTo", () => {
  test("returns { moved: 0 } when no selection", () => {
    const ctx = mockCtx({ cards: [], cardIndex: 0 })
    const result = moveSelectedTo(ctx, { parentId: "target", childIdx: -1 })
    expect(result).toEqual({ moved: 0 })
  })

  test("moves selected nodes and returns count", () => {
    const a = makeNode("a", "old")
    const b = makeNode("b", "old")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
      children: new Map([["target", []]]),
      withMoveNode: true,
    })

    const result = moveSelectedTo(ctx, { parentId: "target", childIdx: -1 })
    expect(result.moved).toBe(2)
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a")
    expect(ctx.undoHandle.startBatch).toHaveBeenCalledWith("Move")
    expect(ctx.undoHandle.endBatch).toHaveBeenCalledTimes(1)
  })

  test("skips self-move (card.id === to.parentId)", () => {
    const a = makeNode("a", "old")
    const b = makeNode("b", "old")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
      children: new Map([["a", []]]),
      withMoveNode: true,
    })

    const result = moveSelectedTo(ctx, { parentId: "a", childIdx: -1 })
    expect(result.moved).toBe(1)
  })

  test("sets cursor before batch", () => {
    const a = makeNode("a", "old")
    const ctx = mockCtx({
      cards: [a],
      cardIndex: 0,
      cursor: "a",
      children: new Map([["target", []]]),
      withMoveNode: true,
    })

    moveSelectedTo(ctx, { parentId: "target", childIdx: -1 })
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a")
  })
})

// =============================================================================
// forEachSelected tests
// =============================================================================

describe("forEachSelected", () => {
  test("calls fn for each node", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    const visited: string[] = []
    const count = forEachSelected(ctx, "Test", (n) => visited.push(n.id))

    expect(count).toBe(2)
    expect(visited).toEqual(["a", "b"])
  })

  test("wraps in batch when >1 node", () => {
    const a = makeNode("a")
    const b = makeNode("b")
    const ctx = mockCtx({
      cards: [a, b],
      cardIndex: 0,
      multiSelected: new Set(["a", "b"]),
    })

    forEachSelected(ctx, "Batch op", (_n) => {})

    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a")
    expect(ctx.undoHandle.startBatch).toHaveBeenCalledWith("Batch op")
    expect(ctx.undoHandle.endBatch).toHaveBeenCalledTimes(1)
  })

  test("does not batch for single node", () => {
    const a = makeNode("a")
    const ctx = mockCtx({
      cards: [a],
      cardIndex: 0,
    })

    const visited: string[] = []
    const count = forEachSelected(ctx, "Single", (n) => visited.push(n.id))

    expect(count).toBe(1)
    expect(visited).toEqual(["a"])
    expect(ctx.undoHandle.setCursor).toHaveBeenCalledWith("a")
    expect(ctx.undoHandle.startBatch).not.toHaveBeenCalled()
    expect(ctx.undoHandle.endBatch).not.toHaveBeenCalled()
  })

  test("returns 0 when no selection", () => {
    const ctx = mockCtx({ cards: [], cardIndex: 0 })

    const fn = vi.fn()
    const count = forEachSelected(ctx, "Empty", fn)

    expect(count).toBe(0)
    expect(fn).not.toHaveBeenCalled()
  })
})
