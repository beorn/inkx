/**
 * Board Reducer — Pure State Tests
 *
 * Tests for the Board.apply() pure navigation reducer.
 * No React, no Repo, no side effects — just state in, state out.
 *
 * See docs/design/tea-state-machines.md for the TEA vision.
 */

import { describe, it, expect } from "vitest"
import {
  applySelect,
  applyBlockNav,
  applyOutlineNav,
  applyPageJump,
  applyFoldLevel,
  applyUnfoldLevel,
  applyToggleFold,
  applyFoldNode,
  applyUnfoldNode,
  applyUnfoldRecursive,
  applyNavigation,
  createBoardNavState,
  MAX_FOLD_DEPTH,
  type BoardNavState,
} from "../src/board/board-reducer.ts"

// =============================================================================
// Helpers
// =============================================================================

function state(overrides: Partial<BoardNavState> = {}): BoardNavState {
  return createBoardNavState(overrides)
}

// =============================================================================
// SELECT
// =============================================================================

describe("Board.apply — SELECT", () => {
  it("sets cursorNodeId to the given node", () => {
    const s = state({ cursorNodeId: "a" })
    const result = applySelect(s, "b")
    expect(result.state.cursorNodeId).toBe("b")
  })

  it("emits a SELECT effect", () => {
    const s = state()
    const result = applySelect(s, "x")
    expect(result.effects).toEqual([{ type: "SELECT", nodeId: "x" }])
  })

  it("preserves other state fields", () => {
    const foldDepths = new Map([["root", 2]])
    const s = state({ cursorNodeId: "a", foldDepths, rootId: "root" })
    const result = applySelect(s, "b")
    expect(result.state.foldDepths).toBe(foldDepths)
    expect(result.state.rootId).toBe("root")
  })
})

// =============================================================================
// BLOCK_NAV (J/K spatial navigation)
// =============================================================================

describe("Board.apply — BLOCK_NAV", () => {
  const blocks = ["col-header", "card-a", "child-a1", "child-a2", "card-b"]

  it("J moves to next visible block", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursorNodeId).toBe("child-a1")
  })

  it("K moves to previous visible block", () => {
    const s = state({ cursorNodeId: "child-a1" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursorNodeId).toBe("card-a")
  })

  it("J at bottom of column is no-op", () => {
    const s = state({ cursorNodeId: "card-b" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursorNodeId).toBe("card-b")
    expect(result.effects).toEqual([])
  })

  it("K at top of column is no-op", () => {
    const s = state({ cursorNodeId: "col-header" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursorNodeId).toBe("col-header")
    expect(result.effects).toEqual([])
  })

  it("J from column header moves to first card", () => {
    const s = state({ cursorNodeId: "col-header" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursorNodeId).toBe("card-a")
  })

  it("K from first card moves to column header", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursorNodeId).toBe("col-header")
  })

  it("no-op when cursor not in visible blocks", () => {
    const s = state({ cursorNodeId: "unknown" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.effects).toEqual([])
  })

  it("no-op when no cursor", () => {
    const s = state({ cursorNodeId: null })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.effects).toEqual([])
  })

  it("no-op with empty block list", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBlockNav(s, "down", [])
    expect(result.effects).toEqual([])
  })

  it("single block: both directions are no-op", () => {
    const s = state({ cursorNodeId: "only" })
    expect(applyBlockNav(s, "down", ["only"]).effects).toEqual([])
    expect(applyBlockNav(s, "up", ["only"]).effects).toEqual([])
  })
})

// =============================================================================
// OUTLINE_NAV (< / > sub-item navigation)
// =============================================================================

describe("Board.apply — OUTLINE_NAV", () => {
  const descendants = ["card", "sub-1", "sub-2", "sub-3"]

  it("next moves to next descendant", () => {
    const s = state({ cursorNodeId: "sub-1" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.state.cursorNodeId).toBe("sub-2")
  })

  it("prev moves to previous descendant", () => {
    const s = state({ cursorNodeId: "sub-2" })
    const result = applyOutlineNav(s, "prev", descendants)
    expect(result.state.cursorNodeId).toBe("sub-1")
  })

  it("next at last descendant is no-op", () => {
    const s = state({ cursorNodeId: "sub-3" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.effects).toEqual([])
  })

  it("prev at first descendant is no-op (card itself)", () => {
    const s = state({ cursorNodeId: "card" })
    const result = applyOutlineNav(s, "prev", descendants)
    expect(result.effects).toEqual([])
  })

  it("no-op when cursor not in descendants", () => {
    const s = state({ cursorNodeId: "unknown" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.effects).toEqual([])
  })

  it("no-op when no cursor", () => {
    const s = state({ cursorNodeId: null })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.effects).toEqual([])
  })
})

// =============================================================================
// PAGE_JUMP (page up/down)
// =============================================================================

describe("Board.apply — PAGE_JUMP", () => {
  const cards = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]

  it("page down jumps by pageSize", () => {
    const s = state({ cursorNodeId: "c2" })
    const result = applyPageJump(s, "down", cards, 2, 5)
    expect(result.state.cursorNodeId).toBe("c7")
  })

  it("page up jumps by pageSize", () => {
    const s = state({ cursorNodeId: "c7" })
    const result = applyPageJump(s, "up", cards, 7, 5)
    expect(result.state.cursorNodeId).toBe("c2")
  })

  it("page down clamps to last card", () => {
    const s = state({ cursorNodeId: "c8" })
    const result = applyPageJump(s, "down", cards, 8, 5)
    expect(result.state.cursorNodeId).toBe("c9")
  })

  it("page up clamps to first card", () => {
    const s = state({ cursorNodeId: "c1" })
    const result = applyPageJump(s, "up", cards, 1, 5)
    expect(result.state.cursorNodeId).toBe("c0")
  })

  it("clears scroll anchor on page jump", () => {
    const s = state({ cursorNodeId: "c2", columnScrollAnchor: { colIdx: 0, anchor: 0 } })
    const result = applyPageJump(s, "down", cards, 2, 5)
    expect(result.state.columnScrollAnchor).toBeNull()
    expect(result.effects).toContainEqual({ type: "SCROLL_ANCHOR_CLEAR" })
  })

  it("no-op when already at boundary (page down at last)", () => {
    const s = state({ cursorNodeId: "c9" })
    const result = applyPageJump(s, "down", cards, 9, 5)
    expect(result.effects).toEqual([])
  })

  it("no-op when already at boundary (page up at first)", () => {
    const s = state({ cursorNodeId: "c0" })
    const result = applyPageJump(s, "up", cards, 0, 5)
    expect(result.effects).toEqual([])
  })

  it("no-op with empty card list", () => {
    const s = state({ cursorNodeId: "c0" })
    const result = applyPageJump(s, "down", [], 0, 5)
    expect(result.effects).toEqual([])
  })
})

// =============================================================================
// FOLD_LEVEL / UNFOLD_LEVEL
// =============================================================================

describe("Board.apply — FOLD_LEVEL / UNFOLD_LEVEL", () => {
  it("FOLD_LEVEL sets all card depths to 0", () => {
    const s = state()
    const result = applyFoldLevel(s, ["card-a", "card-b", "card-c"])
    expect(result.state.foldDepths.get("card-a")).toBe(0)
    expect(result.state.foldDepths.get("card-b")).toBe(0)
    expect(result.state.foldDepths.get("card-c")).toBe(0)
  })

  it("UNFOLD_LEVEL removes all card depths", () => {
    const depths = new Map([
      ["card-a", 0],
      ["card-b", 0],
      ["card-c", 0],
    ])
    const s = state({ foldDepths: depths })
    const result = applyUnfoldLevel(s, ["card-a", "card-b", "card-c"])
    expect(result.state.foldDepths.has("card-a")).toBe(false)
    expect(result.state.foldDepths.has("card-b")).toBe(false)
    expect(result.state.foldDepths.has("card-c")).toBe(false)
  })

  it("UNFOLD_LEVEL preserves non-card fold depths", () => {
    const depths = new Map([
      ["root", 2],
      ["card-a", 0],
    ])
    const s = state({ foldDepths: depths })
    const result = applyUnfoldLevel(s, ["card-a"])
    expect(result.state.foldDepths.get("root")).toBe(2)
    expect(result.state.foldDepths.has("card-a")).toBe(false)
  })

  it("FOLD_LEVEL emits FOLD_SET effect", () => {
    const s = state()
    const result = applyFoldLevel(s, ["card-a"])
    expect(result.effects.length).toBe(1)
    expect(result.effects[0]!.type).toBe("FOLD_SET")
  })
})

// =============================================================================
// TOGGLE_FOLD
// =============================================================================

describe("Board.apply — TOGGLE_FOLD", () => {
  it("folds an unfolded card to depth 0", () => {
    const s = state()
    const result = applyToggleFold(s, "card-a", true)
    expect(result.state.foldDepths.get("card-a")).toBe(0)
  })

  it("unfolds a folded card (removes from map)", () => {
    const depths = new Map([["card-a", 0]])
    const s = state({ foldDepths: depths })
    const result = applyToggleFold(s, "card-a", true)
    expect(result.state.foldDepths.has("card-a")).toBe(false)
  })

  it("no-op when card has no children", () => {
    const s = state()
    const result = applyToggleFold(s, "card-a", false)
    expect(result.effects).toEqual([])
  })

  it("does not mutate original state", () => {
    const depths = new Map([["card-a", 0]])
    const s = state({ foldDepths: depths })
    applyToggleFold(s, "card-a", true)
    // Original state unchanged
    expect(s.foldDepths.get("card-a")).toBe(0)
  })
})

// =============================================================================
// FOLD_NODE / UNFOLD_NODE
// =============================================================================

describe("Board.apply — FOLD_NODE", () => {
  it("scope=root decreases root depth by 1", () => {
    const depths = new Map([["root", 3]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "root", "root", [], [])
    expect(result.state.foldDepths.get("root")).toBe(2)
  })

  it("scope=root clears card-level depths", () => {
    const depths = new Map([
      ["root", 3],
      ["card-a", 1],
      ["card-b", 2],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "root", "root", [], ["card-a", "card-b"])
    expect(result.state.foldDepths.has("card-a")).toBe(false)
    expect(result.state.foldDepths.has("card-b")).toBe(false)
  })

  it("scope=root no-op when root depth is 0", () => {
    const depths = new Map([["root", 0]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "root", "root", [], [])
    expect(result.effects).toEqual([])
  })

  it("scope=card decreases target depth by 1", () => {
    const depths = new Map([
      ["root", 2],
      ["card-a", 3],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "card", "root", ["card-a"], [])
    expect(result.state.foldDepths.get("card-a")).toBe(2)
  })

  it("scope=card initializes from boardDepth-1 when no card depth", () => {
    const depths = new Map([["root", 3]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "card", "root", ["card-a"], [])
    expect(result.state.foldDepths.get("card-a")).toBe(2) // boardDepth(3) - 1
  })

  it("scope=card no-op when target already at 0", () => {
    const depths = new Map([
      ["root", 2],
      ["card-a", 0],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "card", "root", ["card-a"], [])
    expect(result.effects).toEqual([])
  })

  it("scope=card handles multiple targets", () => {
    const depths = new Map([["root", 2]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyFoldNode(s, "card", "root", ["card-a", "card-b"], [])
    expect(result.state.foldDepths.get("card-a")).toBe(1) // boardDepth(2) - 1
    expect(result.state.foldDepths.get("card-b")).toBe(1)
  })

  it("scope=card no-op with empty targets", () => {
    const s = state({ rootId: "root" })
    const result = applyFoldNode(s, "card", "root", [], [])
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — UNFOLD_NODE", () => {
  it("scope=root increases root depth by 1", () => {
    const depths = new Map([["root", 3]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "root", "root", [], [])
    expect(result.state.foldDepths.get("root")).toBe(4)
  })

  it("scope=root no-op at MAX_FOLD_DEPTH", () => {
    const depths = new Map([["root", MAX_FOLD_DEPTH]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "root", "root", [], [])
    expect(result.effects).toEqual([])
  })

  it("scope=root clears card-level depths", () => {
    const depths = new Map([
      ["root", 3],
      ["card-a", 1],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "root", "root", [], ["card-a"])
    expect(result.state.foldDepths.has("card-a")).toBe(false)
  })

  it("scope=card increases target depth by 1", () => {
    const depths = new Map([
      ["root", 2],
      ["card-a", 1],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "card", "root", ["card-a"], [])
    expect(result.state.foldDepths.get("card-a")).toBe(2)
  })

  it("scope=card initializes from boardDepth+1 when no card depth", () => {
    const depths = new Map([["root", 2]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "card", "root", ["card-a"], [])
    expect(result.state.foldDepths.get("card-a")).toBe(3) // boardDepth(2) + 1
  })

  it("scope=card no-op at MAX_FOLD_DEPTH", () => {
    const depths = new Map([
      ["root", 2],
      ["card-a", MAX_FOLD_DEPTH],
    ])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyUnfoldNode(s, "card", "root", ["card-a"], [])
    expect(result.effects).toEqual([])
  })

  it("scope=card no-op with empty targets", () => {
    const s = state({ rootId: "root" })
    const result = applyUnfoldNode(s, "card", "root", [], [])
    expect(result.effects).toEqual([])
  })
})

// =============================================================================
// UNFOLD_RECURSIVE
// =============================================================================

describe("Board.apply — UNFOLD_RECURSIVE", () => {
  it("sets card depth to 999", () => {
    const s = state()
    const result = applyUnfoldRecursive(s, "card-a", [])
    expect(result.state.foldDepths.get("card-a")).toBe(999)
  })

  it("removes descendant fold entries", () => {
    const depths = new Map([
      ["card-a", 0],
      ["sub-1", 0],
      ["sub-2", 1],
    ])
    const s = state({ foldDepths: depths })
    const result = applyUnfoldRecursive(s, "card-a", ["sub-1", "sub-2"])
    expect(result.state.foldDepths.get("card-a")).toBe(999)
    expect(result.state.foldDepths.has("sub-1")).toBe(false)
    expect(result.state.foldDepths.has("sub-2")).toBe(false)
  })

  it("preserves non-descendant fold entries", () => {
    const depths = new Map([
      ["card-a", 0],
      ["card-b", 0],
      ["sub-1", 0],
    ])
    const s = state({ foldDepths: depths })
    const result = applyUnfoldRecursive(s, "card-a", ["sub-1"])
    expect(result.state.foldDepths.get("card-b")).toBe(0) // preserved
  })
})

// =============================================================================
// applyNavigation dispatcher
// =============================================================================

describe("Board.apply — dispatcher", () => {
  it("routes SELECT to applySelect", () => {
    const s = state({ cursorNodeId: "a" })
    const result = applyNavigation(s, { type: "SELECT", nodeId: "b" })
    expect(result.state.cursorNodeId).toBe("b")
  })

  it("routes BLOCK_NAV to applyBlockNav", () => {
    const s = state({ cursorNodeId: "a" })
    const result = applyNavigation(s, { type: "BLOCK_NAV", direction: "down", visibleBlocks: ["a", "b"] })
    expect(result.state.cursorNodeId).toBe("b")
  })

  it("routes TOGGLE_FOLD to applyToggleFold", () => {
    const s = state()
    const result = applyNavigation(s, { type: "TOGGLE_FOLD", nodeId: "card", hasChildren: true })
    expect(result.state.foldDepths.get("card")).toBe(0)
  })

  it("routes FOLD_NODE to applyFoldNode", () => {
    const depths = new Map([["root", 3]])
    const s = state({ foldDepths: depths, rootId: "root" })
    const result = applyNavigation(s, {
      type: "FOLD_NODE",
      scope: "root",
      rootId: "root",
      targetIds: [],
      columnCardIds: [],
    })
    expect(result.state.foldDepths.get("root")).toBe(2)
  })

  it("routes UNFOLD_RECURSIVE to applyUnfoldRecursive", () => {
    const s = state()
    const result = applyNavigation(s, {
      type: "UNFOLD_RECURSIVE",
      cardId: "card",
      descendantFoldIds: [],
    })
    expect(result.state.foldDepths.get("card")).toBe(999)
  })
})

// =============================================================================
// Immutability
// =============================================================================

describe("Board.apply — immutability", () => {
  it("does not mutate original state on SELECT", () => {
    const s = state({ cursorNodeId: "a" })
    const result = applySelect(s, "b")
    expect(s.cursorNodeId).toBe("a")
    expect(result.state.cursorNodeId).toBe("b")
  })

  it("does not mutate original foldDepths on FOLD_LEVEL", () => {
    const depths = new Map<string, number>()
    const s = state({ foldDepths: depths })
    const result = applyFoldLevel(s, ["card-a"])
    expect(depths.size).toBe(0) // original unchanged
    expect(result.state.foldDepths.get("card-a")).toBe(0) // new map has entry
  })

  it("does not mutate original foldDepths on UNFOLD_LEVEL", () => {
    const depths = new Map([["card-a", 0]])
    const s = state({ foldDepths: depths })
    applyUnfoldLevel(s, ["card-a"])
    expect(depths.get("card-a")).toBe(0) // original unchanged
  })
})
