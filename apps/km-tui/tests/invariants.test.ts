/**
 * Invariants Tests — Extended Coverage
 *
 * Tests for checkInvariants beyond the basics in board.test.ts.
 * Covers: virtual node skipping, cursor-under-root, cursor-not-null,
 * column-node-exists, selection-node-exists, colIndex/cardIndex bounds,
 * duplicate columns, move-source-exists, sel-root-matches, viewTree-root-matches.
 *
 * Uses mock OpCtx objects to test each invariant check in isolation.
 */

import { describe, test, expect, vi } from "vitest"
import { createFakeRepo } from "@km/storage"
import { checkInvariants, InvariantViolationError } from "../src/invariants.ts"
import { item } from "./helpers/board-test.ts"
import { createSelection, type ID } from "@silvery/selection"

/** Create a mock SelectionStore for test contexts. */
function createMockSel() {
  return createSelection({
    tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
  })
}

/** Build a minimal valid OpCtx that passes all invariants. */
function validCtx(overrides: Record<string, any> = {}) {
  const repo = createFakeRepo({
    nodes: item("board", item("col1", item("1a"), item("1b"))),
  })
  const sel = createMockSel()

  return {
    repo,
    sel,
    selectedIds: sel.node.ids(),
    rootId: "board",
    cursor: "1a",
    ui: { viewMode: "cards", multiSelected: new Set<string>() },
    colIndex: 0,
    cardIndex: 0,
    isAtCardLevel: true,
    nodeIndex: new Map([["1a", { colIndex: 0, cardIndex: 0 }]]),
    tree: {
      rootId: "board",
      walkOrder: ["col1", "1a", "1b"],
      node: (id: string) => (["col1", "1a", "1b"].includes(id) ? { id } : undefined),
      children: (id: string) => {
        if (id === "board") return ["col1"]
        if (id === "col1") return ["1a", "1b"]
        return []
      },
      parent: () => null,
    },
    moveState: { active: false },
    focusedPaneViewType: () => "board",
    ...overrides,
  } as any
}

// =============================================================================
// Virtual node skipping
// =============================================================================

describe("virtual node skipping", () => {
  test("virtual cursor (__meta__*) skips cursor-exists check", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const ctx = validCtx({ cursor: "__meta__summary" })
    // Should NOT throw for virtual node even though it doesn't exist in repo
    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
    spy.mockRestore()
  })

  test("virtual cursor (__body__*) skips cursor-under-root check", () => {
    const ctx = validCtx({ cursor: "__body__col1" })
    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
  })
})

// =============================================================================
// cursor-not-null
// =============================================================================

describe("cursor-not-null invariant", () => {
  test("null cursor on non-empty board with real cards triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    // Need a sel with kind !== "idle" — select a cursor first so kind() returns "node"
    const sel = createSelection({
      tree: {
        walkOrder: () => ["1a" as ID],
        parent: () => undefined,
        children: () => [],
      },
    })
    sel.node.select(["1a" as ID]) // sets cursor → kind() = "node"

    const ctx = validCtx({
      cursor: null, // But we override cursor to null in the ctx
      sel,
      selectedIds: sel.node.ids(),
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      nodeIndex: new Map(),
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-not-null|Cursor is null/)
    spy.mockRestore()
  })

  test("null cursor is OK when sel is idle", () => {
    const sel = createSelection({
      tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
    })
    // Don't select anything — sel stays idle (kind() = "idle")
    const ctx = validCtx({
      cursor: null,
      sel,
      selectedIds: sel.node.ids(),
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      nodeIndex: new Map(),
    })

    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
  })
})

// =============================================================================
// cursor-under-root
// =============================================================================

describe("cursor-under-root invariant", () => {
  test("cursor not under root triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    // Create repo with two separate roots
    const repo = createFakeRepo({
      nodes: [...item("board", item("col1", item("1a"))), ...item("other-root", item("orphan-card"))],
    })
    const sel = createMockSel()
    const ctx = validCtx({
      repo,
      cursor: "orphan-card", // exists but not under "board"
      rootId: "board",
      sel,
      selectedIds: sel.node.ids(),
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-under-root/)
    spy.mockRestore()
  })
})

// =============================================================================
// selection-node-exists
// =============================================================================

describe("selection-node-exists invariant", () => {
  test("multi-selection with non-existent node triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const selectedIds = {
      size: 1,
      length: 1,
      has: (id: string) => id === "ghost",
      [Symbol.iterator]: function* () {
        yield "ghost"
      },
    }

    const ctx = validCtx({ selectedIds })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/selection-node-exists/)
    spy.mockRestore()
  })

  test("virtual node IDs in selection are skipped", () => {
    const selectedIds = {
      size: 1,
      length: 1,
      has: (id: string) => id === "__meta__summary",
      [Symbol.iterator]: function* () {
        yield "__meta__summary"
      },
    }

    const ctx = validCtx({ selectedIds })
    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
  })
})

// =============================================================================
// colIndex-bounds
// =============================================================================

describe("colIndex-bounds invariant", () => {
  test("colIndex out of bounds triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    // Board has 1 column, but colIndex is 5
    const ctx = validCtx({ colIndex: 5 })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/colIndex-bounds/)
    spy.mockRestore()
  })
})

// =============================================================================
// no-duplicate-columns
// =============================================================================

describe("no-duplicate-columns invariant", () => {
  test("duplicate column IDs trigger violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"))),
    })

    const ctx = validCtx({
      repo,
      tree: {
        rootId: "board",
        walkOrder: ["col1", "col1"],
        node: (id: string) => (id === "col1" || id === "1a" ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1", "col1"] // duplicate!
          if (id === "col1") return ["1a"]
          return []
        },
        parent: () => null,
      },
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/no-duplicate-columns/)
    spy.mockRestore()
  })
})

// =============================================================================
// move-source-exists
// =============================================================================

describe("move-source-exists invariant", () => {
  test("move mode with non-existent source node triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const ctx = validCtx({
      cursor: null,
      moveState: { active: true, sourceNodes: ["ghost-node"] },
    })
    // cursor is null but moveState.active — cursor-not-null is skipped for move mode
    // but move-source-exists should fire

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/move-source-exists/)
    spy.mockRestore()
  })

  test("move mode with existing source node passes", () => {
    const ctx = validCtx({
      cursor: null,
      moveState: { active: true, sourceNodes: ["1a"] },
    })
    // cursor null + move active = OK for cursor-not-null
    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
  })
})

// =============================================================================
// sel-root-matches-rootId
// =============================================================================

describe("sel-root-matches-rootId invariant", () => {
  test("mismatched selection root and rootId triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const sel = createSelection({
      tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
    })
    // Force sel root to something different from rootId
    sel.root.set("other-root" as ID)

    const ctx = validCtx({
      sel,
      selectedIds: sel.node.ids(),
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/sel-root-matches-rootId/)
    spy.mockRestore()
  })
})

// =============================================================================
// viewTree-root-matches
// =============================================================================

describe("viewTree-root-matches invariant", () => {
  test("tree rootId mismatch triggers violation", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const ctx = validCtx({
      tree: {
        rootId: "wrong-root",
        walkOrder: ["col1", "1a"],
        node: (id: string) => (["col1", "1a"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "wrong-root") return ["col1"]
          if (id === "col1") return ["1a"]
          return []
        },
        parent: () => null,
      },
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/viewTree-root-matches/)
    spy.mockRestore()
  })
})

// =============================================================================
// Journey: valid state survives multiple checks
// =============================================================================

describe("invariant journeys", () => {
  test("fully valid state passes all 14 checks without violations", () => {
    const ctx = validCtx()
    const violations = checkInvariants(ctx)
    expect(violations).toEqual([])
  })

  test("InvariantViolationError without ids omits JSON suffix", () => {
    const err = new InvariantViolationError("test-check", "something broke")
    expect(err.ids).toBeUndefined()
    expect(err.message).toBe("Invariant violation [test-check]: something broke")
    expect(err.check).toBe("test-check")
  })
})
