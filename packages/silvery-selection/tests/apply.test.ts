import { describe, expect, it } from "vitest"
import type { ID, SelectionSnapshot } from "../src/types.ts"
import {
  applyCollapse,
  applyDeselect,
  applyExtend,
  applyExitSub,
  applyReconcile,
  applyRemove,
  applyRootUp,
  applySelect,
  applySelectAll,
  applySetRoot,
  applyTextEdit,
  applyTextSelect,
  EMPTY_STATE,
} from "../src/apply.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")
const D = id("D")
const E = id("E")
const ORDER = [A, B, C, D, E]

function makeState(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    cursor: null,
    anchor: null,
    ids: [],
    sub: null,
    root: null,
    ...overrides,
  }
}

function stateWith(ids: ID[], cursor?: ID | null, anchor?: ID | null): SelectionSnapshot {
  return makeState({
    cursor: cursor ?? ids[0] ?? null,
    anchor: anchor ?? ids.at(-1) ?? null,
    ids,
  })
}

/** Helper: check if an ID is in the ids array */
function hasId(state: SelectionSnapshot, needle: ID): boolean {
  return state.ids.indexOf(needle) !== -1
}

/** Helper: create Set from ids for set-equality checks */
function idSet(state: SelectionSnapshot): Set<ID> {
  return new Set(state.ids)
}

// --- applySelect ---

describe("applySelect", () => {
  it("replaces selection with normalized order", () => {
    const state = EMPTY_STATE
    const result = applySelect(state, [C, A], ORDER)
    expect(result.cursor).toBe(A) // first in order
    expect(result.anchor).toBe(C) // last in order
    expect(idSet(result)).toEqual(new Set([A, C]))
    // Verify order: A comes before C in tree-walk order
    expect(result.ids[0]).toBe(A)
    expect(result.ids[1]).toBe(C)
  })

  it("single select: cursor = anchor = the id", () => {
    const result = applySelect(EMPTY_STATE, [B], ORDER)
    expect(result.cursor).toBe(B)
    expect(result.anchor).toBe(B)
    expect(result.ids).toEqual([B])
  })

  it("empty ids without toggle => deselect", () => {
    const state = stateWith([A, B])
    const result = applySelect(state, [], ORDER)
    expect(result.cursor).toBeNull()
    expect(result.ids.length).toBe(0)
  })

  it("clears sub-selection on node op", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 5 },
    })
    const result = applySelect(state, [B], ORDER)
    expect(result.sub).toBeNull()
  })

  it("preserves root", () => {
    const state = makeState({ root: A })
    const result = applySelect(state, [B], ORDER)
    expect(result.root).toBe(A)
  })

  it("filters out IDs not in nodeOrder", () => {
    const result = applySelect(EMPTY_STATE, [id("Z"), A], ORDER)
    expect(result.cursor).toBe(A)
    expect(result.ids).toEqual([A])
  })

  it("all IDs not in order => deselect", () => {
    const result = applySelect(EMPTY_STATE, [id("Z")], ORDER)
    expect(result.cursor).toBeNull()
  })

  // --- No-op detection ---

  it("returns same reference when no change", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: null,
    })
    const result = applySelect(state, [A], ORDER)
    expect(result).toBe(state)
  })

  // --- Toggle mode ---

  describe("toggle", () => {
    it("adds an unselected id", () => {
      const state = stateWith([A])
      const result = applySelect(state, [C], ORDER, true)
      expect(idSet(result)).toEqual(new Set([A, C]))
      expect(result.cursor).toBe(C) // toggle add: cursor = first newly added
      expect(result.anchor).toBe(A) // preserved
    })

    it("removes a selected id (non-cursor)", () => {
      const state = stateWith([A, B, C], A, C)
      const result = applySelect(state, [B], ORDER, true)
      expect(idSet(result)).toEqual(new Set([A, C]))
      expect(result.cursor).toBe(A) // preserved
      expect(result.anchor).toBe(C) // preserved
    })

    it("removes the cursor => first remaining becomes cursor", () => {
      const state = stateWith([A, B, C], A, C)
      const result = applySelect(state, [A], ORDER, true)
      expect(idSet(result)).toEqual(new Set([B, C]))
      expect(result.cursor).toBe(B) // first remaining
      expect(result.anchor).toBe(B) // reset to new cursor
    })

    it("toggle removing all => deselect", () => {
      const state = stateWith([A])
      const result = applySelect(state, [A], ORDER, true)
      expect(result.cursor).toBeNull()
      expect(result.ids.length).toBe(0)
    })

    it("toggle removes anchor => anchor falls to cursor", () => {
      const state = stateWith([A, B], A, B)
      const result = applySelect(state, [B], ORDER, true)
      expect(result.ids).toEqual([A])
      expect(result.anchor).toBe(A)
    })
  })
})

// --- applyExtend ---

describe("applyExtend", () => {
  it("extends range from anchor to new cursor", () => {
    const state = stateWith([B], B, B)
    const result = applyExtend(state, D, ORDER)
    expect(result.cursor).toBe(D)
    expect(result.anchor).toBe(B) // preserved
    expect(idSet(result)).toEqual(new Set([B, C, D]))
  })

  it("extends backwards", () => {
    const state = stateWith([C], C, C)
    const result = applyExtend(state, A, ORDER)
    expect(idSet(result)).toEqual(new Set([A, B, C]))
    expect(result.cursor).toBe(A)
    expect(result.anchor).toBe(C)
  })

  it("from idle state (no anchor) uses cursor as anchor", () => {
    const state = EMPTY_STATE
    const result = applyExtend(state, C, ORDER)
    expect(result.cursor).toBe(C)
    expect(result.anchor).toBe(C)
    expect(result.ids).toEqual([C])
  })

  it("clears sub", () => {
    const state = makeState({
      cursor: B,
      anchor: B,
      ids: [B],
      sub: { kind: "text", nodeId: B, cursor: 3 },
    })
    const result = applyExtend(state, D, ORDER)
    expect(result.sub).toBeNull()
  })

  it("returns same reference when no change", () => {
    const state = makeState({
      cursor: D,
      anchor: B,
      ids: [B, C, D],
      sub: null,
    })
    const result = applyExtend(state, D, ORDER)
    expect(result).toBe(state)
  })
})

// --- applyCollapse ---

describe("applyCollapse", () => {
  it("multi -> single: keeps cursor", () => {
    const state = stateWith([A, B, C], B, A)
    const result = applyCollapse(state)
    expect(result.cursor).toBe(B)
    expect(result.anchor).toBe(B)
    expect(result.ids).toEqual([B])
  })

  it("from idle: no-op", () => {
    const result = applyCollapse(EMPTY_STATE)
    expect(result).toBe(EMPTY_STATE)
  })

  it("already single: returns same ref", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
    })
    const result = applyCollapse(state)
    expect(result).toBe(state)
  })

  it("clears sub", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A, B],
      sub: { kind: "text", nodeId: A, cursor: 0 },
    })
    const result = applyCollapse(state)
    expect(result.sub).toBeNull()
  })
})

// --- applyRemove ---

describe("applyRemove", () => {
  it("removes non-cursor: preserves cursor/anchor", () => {
    const state = stateWith([A, B, C], A, C)
    const result = applyRemove(state, B, ORDER)
    expect(result.cursor).toBe(A)
    expect(result.anchor).toBe(C)
    expect(idSet(result)).toEqual(new Set([A, C]))
  })

  it("removes cursor: next in order becomes cursor", () => {
    const state = stateWith([A, B, C], A, C)
    const result = applyRemove(state, A, ORDER)
    expect(result.cursor).toBe(B) // nearest remaining
    expect(result.anchor).toBe(B) // reset to new cursor
    expect(idSet(result)).toEqual(new Set([B, C]))
  })

  it("removes anchor: anchor falls to cursor", () => {
    const state = stateWith([A, B], A, B)
    const result = applyRemove(state, B, ORDER)
    expect(result.cursor).toBe(A)
    expect(result.anchor).toBe(A)
  })

  it("removes only id => deselect", () => {
    const state = stateWith([A])
    const result = applyRemove(state, A, ORDER)
    expect(result.cursor).toBeNull()
    expect(result.ids.length).toBe(0)
  })

  it("id not in selection: no-op", () => {
    const state = stateWith([A])
    const result = applyRemove(state, B, ORDER)
    expect(result).toBe(state)
  })

  it("clears sub", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A, B],
      sub: { kind: "text", nodeId: A, cursor: 0 },
    })
    const result = applyRemove(state, B, ORDER)
    expect(result.sub).toBeNull()
  })
})

// --- applyDeselect ---

describe("applyDeselect", () => {
  it("clears everything", () => {
    const state = stateWith([A, B, C])
    const result = applyDeselect(state)
    expect(result.cursor).toBeNull()
    expect(result.anchor).toBeNull()
    expect(result.ids.length).toBe(0)
    expect(result.sub).toBeNull()
  })

  it("preserves root", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      root: B,
    })
    const result = applyDeselect(state)
    expect(result.root).toBe(B)
  })

  it("already empty: returns same ref", () => {
    const result = applyDeselect(EMPTY_STATE)
    expect(result).toBe(EMPTY_STATE)
  })

  it("no arg: returns EMPTY_STATE", () => {
    const result = applyDeselect()
    expect(result).toBe(EMPTY_STATE)
  })
})

// --- applySelectAll ---

describe("applySelectAll", () => {
  it("selects all children", () => {
    const state = stateWith([A])
    const children = [A, B, C]
    const result = applySelectAll(state, null, children)
    expect(idSet(result)).toEqual(new Set([A, B, C]))
    expect(result.cursor).toBe(A) // preserved (was in children)
    expect(result.anchor).toBe(A)
  })

  it("already all selected => no-op (same ref)", () => {
    const state = stateWith([A, B, C], A, A)
    const children = [A, B, C]
    const result = applySelectAll(state, null, children)
    expect(result).toBe(state)
  })

  it("no children: no-op", () => {
    const state = stateWith([A])
    const result = applySelectAll(state, null, [])
    expect(result).toBe(state)
  })

  it("cursor not in children: falls to first child", () => {
    const state = stateWith([D])
    const children = [A, B, C]
    const result = applySelectAll(state, null, children)
    expect(result.cursor).toBe(A)
  })

  it("clears sub (node op)", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 0 },
    })
    const result = applySelectAll(state, null, [A, B, C])
    expect(result.sub).toBeNull()
  })
})

// --- applyTextEdit ---

describe("applyTextEdit", () => {
  it("enters text mode", () => {
    const state = stateWith([A])
    const result = applyTextEdit(state, A, 5)
    expect(result.sub).toEqual({ kind: "text", nodeId: A, cursor: 5 })
  })

  it("preserves node selection", () => {
    const state = stateWith([A, B])
    const result = applyTextEdit(state, A, 0)
    expect(result.cursor).toBe(A)
    expect(result.ids).toEqual([A, B])
  })

  it("same text edit: returns same ref", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 5 },
    })
    const result = applyTextEdit(state, A, 5)
    expect(result).toBe(state)
  })
})

// --- applyTextSelect ---

describe("applyTextSelect", () => {
  it("moves caret", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 3 },
    })
    const result = applyTextSelect(state, 7)
    expect(result.sub).toEqual({
      kind: "text",
      nodeId: A,
      cursor: 7,
      anchor: undefined,
    })
  })

  it("sets range", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 3 },
    })
    const result = applyTextSelect(state, 7, 3)
    expect(result.sub).toEqual({
      kind: "text",
      nodeId: A,
      cursor: 7,
      anchor: 3,
    })
  })

  it("not in text mode: no-op", () => {
    const state = stateWith([A])
    const result = applyTextSelect(state, 5)
    expect(result).toBe(state)
  })

  it("same caret: returns same ref", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 5 },
    })
    const result = applyTextSelect(state, 5)
    expect(result).toBe(state)
  })
})

// --- applyExitSub ---

describe("applyExitSub", () => {
  it("clears sub, preserves nodes", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: A, cursor: 5 },
    })
    const result = applyExitSub(state)
    expect(result.sub).toBeNull()
    expect(result.cursor).toBe(A)
    expect(result.ids).toEqual([A])
  })

  it("no sub: returns same ref", () => {
    const state = stateWith([A])
    const result = applyExitSub(state)
    expect(result).toBe(state)
  })
})

// --- applyReconcile ---

describe("applyReconcile", () => {
  it("prunes deleted IDs", () => {
    const state = stateWith([A, B, C], A, C)
    const validIds = new Set([A, C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(idSet(result)).toEqual(new Set([A, C]))
    expect(result.cursor).toBe(A)
    expect(result.anchor).toBe(C)
  })

  it("cursor removed: nearest remaining", () => {
    const state = stateWith([A, B, C], B, A)
    const validIds = new Set([A, C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result.cursor).toBe(A) // nearest to B in order
  })

  it("anchor removed: falls to cursor", () => {
    const state = stateWith([A, B, C], A, C)
    const validIds = new Set([A, B, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result.anchor).toBe(A) // cursor
  })

  it("all removed: deselect", () => {
    const state = stateWith([A, B])
    const validIds = new Set([C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result.cursor).toBeNull()
    expect(result.ids.length).toBe(0)
  })

  it("nothing changed: returns same ref", () => {
    const state = stateWith([A, B], A, B)
    const validIds = new Set([A, B, C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result).toBe(state)
  })

  it("prunes text sub if node deleted", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A, B],
      sub: { kind: "text", nodeId: B, cursor: 3 },
    })
    const validIds = new Set([A, C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result.sub).toBeNull()
  })

  it("preserves text sub if node still valid", () => {
    const state = makeState({
      cursor: A,
      anchor: A,
      ids: [A, B],
      sub: { kind: "text", nodeId: A, cursor: 3 },
    })
    const validIds = new Set([A, B, C, D, E] as ID[])
    const result = applyReconcile(state, validIds, ORDER)
    expect(result.sub).toEqual({ kind: "text", nodeId: A, cursor: 3 })
  })
})

// --- applySetRoot ---

describe("applySetRoot", () => {
  it("sets root", () => {
    const state = EMPTY_STATE
    const result = applySetRoot(state, A)
    expect(result.root).toBe(A)
  })

  it("same root: returns same ref", () => {
    const state = makeState({ root: A })
    const result = applySetRoot(state, A)
    expect(result).toBe(state)
  })

  it("clears root with null", () => {
    const state = makeState({ root: A })
    const result = applySetRoot(state, null)
    expect(result.root).toBeNull()
  })
})

// --- applyRootUp ---

describe("applyRootUp", () => {
  it("pops root to parent", () => {
    const parents = new Map<ID, ID | null>([
      [B, A],
      [A, null],
    ])
    const state = makeState({ root: B })
    const result = applyRootUp(state, (id) => parents.get(id) ?? null)
    expect(result.root).toBe(A)
  })

  it("pops to null for top-level", () => {
    const state = makeState({ root: A })
    const result = applyRootUp(state, () => null)
    expect(result.root).toBeNull()
  })

  it("no root: no-op", () => {
    const result = applyRootUp(EMPTY_STATE, () => null)
    expect(result).toBe(EMPTY_STATE)
  })
})
