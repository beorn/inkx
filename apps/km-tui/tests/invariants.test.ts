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
    tree: {
      walkOrder: () => [],
      parent: () => undefined,
      children: () => [],
      contains: () => false,
    },
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
      parent: (id: string) => {
        if (id === "1a" || id === "1b") return "col1"
        if (id === "col1") return "board"
        return null
      },
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
        contains: (id) => id === ("1a" as ID),
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
      tree: {
        walkOrder: () => [],
        parent: () => undefined,
        children: () => [],
        contains: () => false,
      },
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
  test("cursor visible through the view projection counts as under root", () => {
    const repo = createFakeRepo({
      nodes: [
        ...item("@agent", item("@agent/3")),
        ...item("@km/silvercode/agent-host-l5.md", item("01KR3438GYZH5K5QJ65PY1V1D8")),
      ],
    })
    const sel = createMockSel()
    const ctx = validCtx({
      repo,
      cursor: "01KR3438GYZH5K5QJ65PY1V1D8",
      rootId: "@agent",
      sel,
      selectedIds: sel.node.ids(),
      tree: {
        rootId: "@agent",
        walkOrder: ["@agent/3", "01KR3438GYZH5K5QJ65PY1V1D8"],
        node: (id: string) => (["@agent/3", "01KR3438GYZH5K5QJ65PY1V1D8"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "@agent") return ["@agent/3"]
          if (id === "@agent/3") return ["01KR3438GYZH5K5QJ65PY1V1D8"]
          return []
        },
        parent: (id: string) => {
          if (id === "01KR3438GYZH5K5QJ65PY1V1D8") return "@agent/3"
          if (id === "@agent/3") return "@agent"
          return null
        },
      },
      nodeIndex: new Map([["01KR3438GYZH5K5QJ65PY1V1D8", { colIndex: 0, cardIndex: 0 }]]),
    })

    expect(checkInvariants(ctx)).toEqual([])
  })

  test("cursor not under root is FATAL — data-corruption class must surface loudly", () => {
    // Previously this check was marked recoverable as a 24-hour triage while
    // the ghost-writer class (parent_id corruption from unvalidated node_moved
    // events) was unknown. km-storage.move-type-validation closed that class
    // in 6cda83b22. Going forward, any trip of this check is a new bug in a
    // writer that MUST be hunted and fixed — silent recovery would mask it.
    // The plateau answer is km-all.unified-selection; see km-tui.cursor-under-root-crash.
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

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-under-root/)
    spy.mockRestore()
  })

  test("cursor-in-columns is FATAL — data-corruption class must surface loudly", () => {
    // Same rationale as cursor-under-root above: ghost-writer class closed by
    // move-type-validation, so any future trip is a real writer bug that must
    // not be masked. Plateau fix: km-all.unified-selection.
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
    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-under-root|cursor-in-columns/)
    spy.mockRestore()
  })

  test("cursor-visible is FATAL — hidden cursors must surface loudly", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("visible-card"), item("hidden-card"))),
    })
    const sel = createMockSel()
    const ctx = validCtx({
      repo,
      cursor: "hidden-card",
      rootId: "board",
      sel,
      selectedIds: sel.node.ids(),
      colIndex: 0,
      cardIndex: 1,
      isAtCardLevel: true,
      nodeIndex: new Map([["visible-card", { colIndex: 0, cardIndex: 0 }]]),
      tree: {
        rootId: "board",
        walkOrder: ["col1", "visible-card"],
        node: (id: string) => (["col1", "visible-card", "hidden-card"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1"]
          if (id === "col1") return ["visible-card"]
          return []
        },
        parent: (id: string) => {
          if (id === "visible-card" || id === "hidden-card") return "col1"
          if (id === "col1") return "board"
          return null
        },
      },
    })

    expect(() => checkInvariants(ctx)).toThrow(InvariantViolationError)
    expect(() => checkInvariants(ctx)).toThrow(/cursor-visible/)
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
  test("missing selected cursor is recoverable stale-cursor drift", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const selectedIds = {
      size: 1,
      length: 1,
      has: (id: string) => id === "ghost-cursor",
      [Symbol.iterator]: function* () {
        yield "ghost-cursor"
      },
    }

    const ctx = validCtx({
      cursor: "ghost-cursor",
      selectedIds,
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      nodeIndex: new Map(),
      tree: {
        rootId: "board",
        walkOrder: ["col1", "1a", "1b"],
        node: (id: string) => (["col1", "1a", "1b"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1"]
          if (id === "col1") return ["1a", "1b"]
          return []
        },
        parent: (id: string) => {
          if (id === "1a" || id === "1b") return "col1"
          if (id === "col1") return "board"
          return null
        },
      },
    })

    const violations = checkInvariants(ctx)
    expect(violations.map((v) => v.check)).toEqual(["cursor-exists", "selection-node-exists"])
    expect(violations.every((v) => v.recoverable)).toBe(true)
    spy.mockRestore()
  })

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
// column-node-exists
// =============================================================================

describe("column-node-exists invariant", () => {
  test("stale missing column header is recoverable projection drift", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const ctx = validCtx({
      cursor: "board",
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      nodeIndex: new Map(),
      tree: {
        rootId: "board",
        walkOrder: ["deleted-col"],
        node: (id: string) => (id === "deleted-col" ? { id } : undefined),
        children: (id: string) => (id === "board" ? ["deleted-col"] : []),
        parent: (id: string) => (id === "deleted-col" ? "board" : null),
      },
    })

    const violations = checkInvariants(ctx)
    expect(violations).toEqual([
      {
        check: "column-node-exists",
        message: "Column 0 header references non-existent node",
        ids: { columnNodeId: "deleted-col" },
        recoverable: true,
      },
    ])
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
        parent: (id: string) => {
          if (id === "1a") return "col1"
          if (id === "col1") return "board"
          return null
        },
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
  test("mismatched selection root is recoverable — returns violation, does not throw", () => {
    // Regression for km-tui.sel-root-sync-crash. Sync drift between pane
    // rootId and sel tree root used to crash the TUI fatally. Now
    // surfaces as a recoverable violation so the Phase 3 handler can
    // call sel.root.set(rootId) to re-sync.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const sel = createSelection({
      tree: {
        walkOrder: () => [],
        parent: () => undefined,
        children: () => [],
        contains: () => false,
      },
    })
    // Force sel root to something different from rootId
    sel.root.set("other-root" as ID)

    const ctx = validCtx({
      sel,
      selectedIds: sel.node.ids(),
    })

    const violations = checkInvariants(ctx)
    const selRoot = violations.find((v) => v.check === "sel-root-matches-rootId")
    expect(selRoot).toBeDefined()
    expect(selRoot?.recoverable).toBe(true)
    expect(selRoot?.ids).toMatchObject({ selRoot: "other-root", rootId: "board" })
    spy.mockRestore()
  })
})

// =============================================================================
// viewTree-root-matches
// =============================================================================

describe("viewTree-root-matches invariant", () => {
  test("tree rootId mismatch is recoverable — returns violation, does not throw", () => {
    // Same sync-drift class as sel-root-matches-rootId. The Phase 3 handler
    // re-syncs by calling sel.root.set(rootId) which propagates through
    // signals and rebuilds the ViewTreeProjection.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    const ctx = validCtx({
      tree: {
        rootId: "wrong-root",
        walkOrder: ["col1", "1a"],
        node: (id: string) => (["col1", "1a"].includes(id) ? { id } : undefined),
        children: (id: string) => {
          if (id === "board") return ["col1"]
          if (id === "wrong-root") return ["col1"]
          if (id === "col1") return ["1a"]
          return []
        },
        parent: (id: string) => {
          if (id === "1a") return "col1"
          if (id === "col1") return "board"
          return null
        },
      },
    })

    const violations = checkInvariants(ctx)
    const viewTree = violations.find((v) => v.check === "viewTree-root-matches")
    expect(viewTree).toBeDefined()
    expect(viewTree?.recoverable).toBe(true)
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
