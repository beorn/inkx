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
  test("cursor not under root is recoverable — returns violation, does not throw", () => {
    // Regression for km-tui.cursor-under-root-crash. A stale cursor that survives
    // a file/folder rename (or comes from any other persistence source) used to
    // crash the TUI on the first event after load. It now surfaces as a
    // recoverable violation so the caller can reset the cursor to rootId.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    // Create repo with two separate roots — the orphan card is valid
    // in the repo but parented to "other-root", not to "board".
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
      // Tree must mirror the simpler repo shape: col1 has only 1a
      tree: {
        rootId: "board",
        walkOrder: ["col1", "1a"],
        node: (id: string) => (["col1", "1a"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1"]
          if (id === "col1") return ["1a"]
          return []
        },
        parent: () => null,
      },
      nodeIndex: new Map([["1a", { colIndex: 0, cardIndex: 0 }]]),
    })

    const violations = checkInvariants(ctx)
    // Three cursor-consistency checks fire — cursor-under-root, cursor-visible,
    // and cursor-in-walkOrder — all symptoms of the same stale-cursor root
    // cause and all marked recoverable.
    const checks = violations.map((v) => v.check).sort()
    expect(checks).toEqual(["cursor-in-walkOrder", "cursor-under-root", "cursor-visible"])
    expect(violations.every((v) => v.recoverable)).toBe(true)
    const underRoot = violations.find((v) => v.check === "cursor-under-root")
    expect(underRoot?.ids).toMatchObject({ cursor: "orphan-card", rootId: "board" })
    spy.mockRestore()
  })

  test("cursor-in-columns is recoverable — cursor exists in repo but not in any column", () => {
    // Regression for km-tui.cursor-in-columns-crash. A file-path cursor whose
    // parent_id points into an unrelated ULID subtree exists in repo but is
    // not derivable as a column. Used to crash the TUI fatally; now surfaces
    // as a recoverable violation so the Phase 3 handler resets the cursor.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = createFakeRepo({
      nodes: [...item("board", item("col1", item("1a"))), ...item("other-root", item("orphan-card"))],
    })
    const sel = createMockSel()
    const ctx = validCtx({
      repo,
      cursor: "orphan-card",
      rootId: "board",
      sel,
      selectedIds: sel.node.ids(),
      colIndex: -1, // not in any column
      cardIndex: -1,
      isAtCardLevel: false,
      nodeIndex: new Map(),
      // Tree has the board's actual children — orphan-card isn't there
      tree: {
        rootId: "board",
        walkOrder: ["col1", "1a"],
        node: (id: string) => (["col1", "1a"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1"]
          if (id === "col1") return ["1a"]
          return []
        },
        parent: () => null,
      },
    })
    const violations = checkInvariants(ctx)
    const cursorInColumns = violations.find((v) => v.check === "cursor-in-columns")
    expect(cursorInColumns).toBeDefined()
    expect(cursorInColumns?.recoverable).toBe(true)
    expect(cursorInColumns?.ids).toMatchObject({ cursor: "orphan-card", rootId: "board" })
    spy.mockRestore()
  })

  test("fatal violations still throw even when a recoverable one is present", () => {
    // If both a recoverable and a fatal violation fire, fatal wins and throws.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = createFakeRepo({
      nodes: [...item("board", item("col1", item("1a"))), ...item("other-root", item("orphan-card"))],
    })
    const sel = createMockSel()
    const ctx = validCtx({
      repo,
      cursor: "orphan-card", // recoverable: not under rootId "board"
      rootId: "board",
      sel,
      // Force a fatal violation: invalid column node ID in the tree
      tree: {
        rootId: "board",
        walkOrder: ["col1", "1a", "missing-col"],
        node: (id: string) => (["col1", "1a", "missing-col"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1", "missing-col"]
          if (id === "col1") return ["1a"]
          return []
        },
        parent: () => null,
      },
    })
    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
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
