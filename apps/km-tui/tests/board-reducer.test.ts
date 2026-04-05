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
  applyBoard,
  createBoardNavState,
  MAX_FOLD_DEPTH,
  type BoardNavState,
  type IndentContext,
  type OutdentContext,
  type InsertNodeContext,
  type DeleteNodeContext,
  type MoveNodeContext,
  type ToggleStatusContext,
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
  it("sets cursor to the given node", () => {
    const s = state({ cursor: "a" })
    const result = applySelect(s, "b")
    expect(result.state.cursor).toBe("b")
  })

  it("emits a SELECT effect", () => {
    const s = state()
    const result = applySelect(s, "x")
    expect(result.effects).toEqual([{ type: "SELECT", nodeId: "x" }])
  })

  it("preserves other state fields", () => {
    const foldDepths = new Map([["root", 2]])
    const s = state({ cursor: "a", foldDepths, rootId: "root" })
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
    const s = state({ cursor: "card-a" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursor).toBe("child-a1")
  })

  it("K moves to previous visible block", () => {
    const s = state({ cursor: "child-a1" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursor).toBe("card-a")
  })

  it("J at bottom of column is no-op", () => {
    const s = state({ cursor: "card-b" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursor).toBe("card-b")
    expect(result.effects).toEqual([])
  })

  it("K at top of column is no-op", () => {
    const s = state({ cursor: "col-header" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursor).toBe("col-header")
    expect(result.effects).toEqual([])
  })

  it("J from column header moves to first card", () => {
    const s = state({ cursor: "col-header" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.state.cursor).toBe("card-a")
  })

  it("K from first card moves to column header", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBlockNav(s, "up", blocks)
    expect(result.state.cursor).toBe("col-header")
  })

  it("no-op when cursor not in visible blocks", () => {
    const s = state({ cursor: "unknown" })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.effects).toEqual([])
  })

  it("no-op when no cursor", () => {
    const s = state({ cursor: null })
    const result = applyBlockNav(s, "down", blocks)
    expect(result.effects).toEqual([])
  })

  it("no-op with empty block list", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBlockNav(s, "down", [])
    expect(result.effects).toEqual([])
  })

  it("single block: both directions are no-op", () => {
    const s = state({ cursor: "only" })
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
    const s = state({ cursor: "sub-1" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.state.cursor).toBe("sub-2")
  })

  it("prev moves to previous descendant", () => {
    const s = state({ cursor: "sub-2" })
    const result = applyOutlineNav(s, "prev", descendants)
    expect(result.state.cursor).toBe("sub-1")
  })

  it("next at last descendant is no-op", () => {
    const s = state({ cursor: "sub-3" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.effects).toEqual([])
  })

  it("prev at first descendant is no-op (card itself)", () => {
    const s = state({ cursor: "card" })
    const result = applyOutlineNav(s, "prev", descendants)
    expect(result.effects).toEqual([])
  })

  it("no-op when cursor not in descendants", () => {
    const s = state({ cursor: "unknown" })
    const result = applyOutlineNav(s, "next", descendants)
    expect(result.effects).toEqual([])
  })

  it("no-op when no cursor", () => {
    const s = state({ cursor: null })
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
    const s = state({ cursor: "c2" })
    const result = applyPageJump(s, "down", cards, 2, 5)
    expect(result.state.cursor).toBe("c7")
  })

  it("page up jumps by pageSize", () => {
    const s = state({ cursor: "c7" })
    const result = applyPageJump(s, "up", cards, 7, 5)
    expect(result.state.cursor).toBe("c2")
  })

  it("page down clamps to last card", () => {
    const s = state({ cursor: "c8" })
    const result = applyPageJump(s, "down", cards, 8, 5)
    expect(result.state.cursor).toBe("c9")
  })

  it("page up clamps to first card", () => {
    const s = state({ cursor: "c1" })
    const result = applyPageJump(s, "up", cards, 1, 5)
    expect(result.state.cursor).toBe("c0")
  })

  it("clears scroll anchor on page jump", () => {
    const s = state({ cursor: "c2", columnScrollAnchor: { colIdx: 0, anchor: 0 } })
    const result = applyPageJump(s, "down", cards, 2, 5)
    expect(result.state.columnScrollAnchor).toBeNull()
    expect(result.effects).toContainEqual({ type: "SCROLL_ANCHOR_CLEAR" })
  })

  it("no-op when already at boundary (page down at last)", () => {
    const s = state({ cursor: "c9" })
    const result = applyPageJump(s, "down", cards, 9, 5)
    expect(result.effects).toEqual([])
  })

  it("no-op when already at boundary (page up at first)", () => {
    const s = state({ cursor: "c0" })
    const result = applyPageJump(s, "up", cards, 0, 5)
    expect(result.effects).toEqual([])
  })

  it("no-op with empty card list", () => {
    const s = state({ cursor: "c0" })
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
    const s = state({ cursor: "a" })
    const result = applyNavigation(s, { type: "SELECT", nodeId: "b" })
    expect(result.state.cursor).toBe("b")
  })

  it("routes BLOCK_NAV to applyBlockNav", () => {
    const s = state({ cursor: "a" })
    const result = applyNavigation(s, { type: "BLOCK_NAV", direction: "down", visibleBlocks: ["a", "b"] })
    expect(result.state.cursor).toBe("b")
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
    const s = state({ cursor: "a" })
    const result = applySelect(s, "b")
    expect(s.cursor).toBe("a")
    expect(result.state.cursor).toBe("b")
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

// =============================================================================
// Edit Operations — Phase 2
// =============================================================================

describe("Board.apply — INDENT_NODE", () => {
  it("emits REPO_MOVE_NODE effect for single node", () => {
    const s = state({ cursor: "card-b" })
    const nodes: IndentContext[] = [{ nodeId: "card-b", newParentId: "card-a", sortOrder: 0 }]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })

    const moveEffects = result.effects.filter((e) => e.type === "REPO_MOVE_NODE")
    expect(moveEffects).toHaveLength(1)
    expect(moveEffects[0]).toEqual({
      type: "REPO_MOVE_NODE",
      nodeId: "card-b",
      newParentId: "card-a",
      sortOrder: 0,
    })
  })

  it("moves cursor to first indented node", () => {
    const s = state({ cursor: "card-c" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.state.cursor).toBe("card-b")
  })

  it("emits CLEAR_SELECTION for batch indent", () => {
    const s = state({ cursor: "card-b" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "CLEAR_SELECTION")).toBe(true)
  })

  it("emits UNDO_START_BATCH/UNDO_END_BATCH for multiple nodes", () => {
    const s = state({ cursor: "card-b" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("no-op for empty nodes list", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBoard(s, { type: "INDENT_NODE", nodes: [] })
    expect(result.effects).toEqual([])
  })

  it("does not emit batch markers for single node", () => {
    const s = state({ cursor: "card-b" })
    const nodes: IndentContext[] = [{ nodeId: "card-b", newParentId: "card-a", sortOrder: 0 }]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(false)
  })
})

describe("Board.apply — OUTDENT_NODE", () => {
  it("emits REPO_MOVE_NODE effect for single node", () => {
    const s = state({ cursor: "sub-item" })
    const nodes: OutdentContext[] = [{ nodeId: "sub-item", newParentId: "col-1", sortOrder: 5 }]
    const result = applyBoard(s, { type: "OUTDENT_NODE", nodes })

    const moveEffects = result.effects.filter((e) => e.type === "REPO_MOVE_NODE")
    expect(moveEffects).toHaveLength(1)
    expect(moveEffects[0]).toEqual({
      type: "REPO_MOVE_NODE",
      nodeId: "sub-item",
      newParentId: "col-1",
      sortOrder: 5,
    })
  })

  it("moves cursor to first outdented node", () => {
    const s = state({ cursor: "sub-b" })
    const nodes: OutdentContext[] = [
      { nodeId: "sub-a", newParentId: "col-1", sortOrder: 1 },
      { nodeId: "sub-b", newParentId: "col-1", sortOrder: 2 },
    ]
    const result = applyBoard(s, { type: "OUTDENT_NODE", nodes })
    expect(result.state.cursor).toBe("sub-a")
  })

  it("no-op for empty nodes list", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBoard(s, { type: "OUTDENT_NODE", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — INSERT_NODE", () => {
  it("emits REPO_ADD_NODE effect", () => {
    const s = state({ cursor: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "p", content: "", parent_idx: 1.5 },
      enterEdit: true,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })

    const addEffects = result.effects.filter((e) => e.type === "REPO_ADD_NODE")
    expect(addEffects).toHaveLength(1)
    expect(addEffects[0]).toEqual({
      type: "REPO_ADD_NODE",
      parentId: "col-1",
      node: { type: "p", content: "", parent_idx: 1.5 },
      selectAfter: true,
    })
  })

  it("emits RENDER_FLUSH when enterEdit is true", () => {
    const s = state({ cursor: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "p", content: "" },
      enterEdit: true,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })
    expect(result.effects.some((e) => e.type === "RENDER_FLUSH")).toBe(true)
  })

  it("does not emit RENDER_FLUSH when enterEdit is false", () => {
    const s = state({ cursor: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "h", content: "New section" },
      enterEdit: false,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })
    expect(result.effects.some((e) => e.type === "RENDER_FLUSH")).toBe(false)
  })

  it("emits UNDO_SET_CURSOR for undo tracking", () => {
    const s = state({ cursor: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "p", content: "" },
      enterEdit: false,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })
    expect(result.effects.some((e) => e.type === "UNDO_SET_CURSOR")).toBe(true)
  })
})

describe("Board.apply — DELETE_NODE", () => {
  it("emits REPO_DELETE_NODE effects in reverse order", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a", "card-b"],
      cursorTarget: "card-c",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })

    const deleteEffects = result.effects.filter((e) => e.type === "REPO_DELETE_NODE")
    expect(deleteEffects).toHaveLength(2)
    // Reversed order for bottom-up deletion
    expect(deleteEffects[0]).toEqual({ type: "REPO_DELETE_NODE", nodeId: "card-b" })
    expect(deleteEffects[1]).toEqual({ type: "REPO_DELETE_NODE", nodeId: "card-a" })
  })

  it("moves cursor to pre-computed target", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.state.cursor).toBe("card-b")
  })

  it("falls back to current cursor when no target", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-b"],
      cursorTarget: null,
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.state.cursor).toBe("card-a")
  })

  it("emits undo batch markers", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("emits CLEAR_SELECTION", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.effects.some((e) => e.type === "CLEAR_SELECTION")).toBe(true)
  })

  it("no-op for empty nodeIds", () => {
    const s = state({ cursor: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: [],
      cursorTarget: null,
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — TOGGLE_TASK_STATUS", () => {
  it("emits REPO_UPDATE_NODE effects for each node", () => {
    const s = state({ cursor: "task-1" })
    const nodes: ToggleStatusContext[] = [
      {
        nodeId: "task-1",
        nextStatus: "wip",
        marker: "[/]",
        itemUpdate: { item: { task: { status: "wip", marker: "[/]" } } },
      },
      {
        nodeId: "task-2",
        nextStatus: "done",
        marker: "[x]",
        itemUpdate: { item: { task: { status: "done", marker: "[x]" } } },
      },
    ]
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes })

    const updateEffects = result.effects.filter((e) => e.type === "REPO_UPDATE_NODE")
    expect(updateEffects).toHaveLength(2)
  })

  it("preserves cursor position (in-place modification)", () => {
    const s = state({ cursor: "task-1" })
    const nodes: ToggleStatusContext[] = [
      {
        nodeId: "task-1",
        nextStatus: "wip",
        marker: "[/]",
        itemUpdate: { item: { task: { status: "wip", marker: "[/]" } } },
      },
    ]
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes })
    expect(result.state.cursor).toBe("task-1")
  })

  it("emits SELECT to trigger UI update", () => {
    const s = state({ cursor: "task-1" })
    const nodes: ToggleStatusContext[] = [
      {
        nodeId: "task-1",
        nextStatus: "done",
        marker: "[x]",
        itemUpdate: { item: { task: { status: "done", marker: "[x]" } } },
      },
    ]
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes })
    expect(result.effects.some((e) => e.type === "SELECT")).toBe(true)
  })

  it("no-op for empty nodes", () => {
    const s = state({ cursor: "task-1" })
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — MOVE_NODE_UP / MOVE_NODE_DOWN", () => {
  it("emits REPO_MOVE_NODE effects for move up", () => {
    const s = state({ cursor: "card-b" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-b", parentId: "col-1", sortOrder: -0.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes })

    const moveEffects = result.effects.filter((e) => e.type === "REPO_MOVE_NODE")
    expect(moveEffects).toHaveLength(1)
    expect(moveEffects[0]).toEqual({
      type: "REPO_MOVE_NODE",
      nodeId: "card-b",
      newParentId: "col-1",
      sortOrder: -0.5,
    })
  })

  it("emits REPO_MOVE_NODE effects for move down", () => {
    const s = state({ cursor: "card-a" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-a", parentId: "col-1", sortOrder: 1.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_DOWN", nodes })

    const moveEffects = result.effects.filter((e) => e.type === "REPO_MOVE_NODE")
    expect(moveEffects).toHaveLength(1)
  })

  it("emits undo batch markers", () => {
    const s = state({ cursor: "card-a" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-a", parentId: "col-1", sortOrder: 1.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("preserves cursor after move", () => {
    const s = state({ cursor: "card-b" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-b", parentId: "col-1", sortOrder: -0.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes })
    expect(result.state.cursor).toBe("card-b")
  })

  it("no-op for empty nodes", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

// =============================================================================
// applyBoard combined dispatcher
// =============================================================================

describe("Board.apply — combined dispatcher", () => {
  it("routes navigation ops to applyNavigation", () => {
    const s = state({ cursor: "a" })
    const result = applyBoard(s, { type: "SELECT", nodeId: "b" })
    expect(result.state.cursor).toBe("b")
  })

  it("routes edit ops to applyEdit", () => {
    const s = state({ cursor: "card-a" })
    const result = applyBoard(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev-sibling", sortOrder: 0 }],
    })
    expect(result.effects.some((e) => e.type === "REPO_MOVE_NODE")).toBe(true)
  })
})

// =============================================================================
// runBoardEffects — centralized effect interpreter
// =============================================================================

import { runBoardEffects } from "../src/board/board-effect-runner.ts"
import type { ApplyResult, BoardEffect } from "../src/board/board-reducer.ts"
import { createSelection } from "@silvery/selection"

/** Minimal mock OpCtx for testing effect runner. Tracks all calls. */
function mockCtx() {
  const calls: { method: string; args: unknown[] }[] = []
  const sel = createSelection({
    tree: { walkOrder: () => [], parent: () => undefined, children: () => [] },
  })
  // Intercept sel.node.select to track calls
  const origSelect = sel.node.select.bind(sel.node)
  sel.node.select = (...args: unknown[]) => {
    calls.push({ method: "sel.node.select", args })
    origSelect(...(args as Parameters<typeof origSelect>))
  }
  return {
    calls,
    dispatchBoard: (...args: unknown[]) => calls.push({ method: "dispatchBoard", args }),
    setUI: (...args: unknown[]) => calls.push({ method: "setUI", args }),
    setFoldDepths: (...args: unknown[]) => calls.push({ method: "setFoldDepths", args }),
    sel,
    textEditHints: null as import("../src/tui-context.ts").TextEditHints | null,
    repo: {
      getNode: () => null,
      moveNode: (...args: unknown[]) => calls.push({ method: "repo.moveNode", args }),
      addNode: (...args: unknown[]) => {
        calls.push({ method: "repo.addNode", args })
        return "new-node-id"
      },
      deleteNode: (...args: unknown[]) => calls.push({ method: "repo.deleteNode", args }),
      updateNode: (...args: unknown[]) => calls.push({ method: "repo.updateNode", args }),
    },
    undoHandle: {
      setCursor: (...args: unknown[]) => calls.push({ method: "undoHandle.setCursor", args }),
      startBatch: (...args: unknown[]) => calls.push({ method: "undoHandle.startBatch", args }),
      endBatch: (...args: unknown[]) => calls.push({ method: "undoHandle.endBatch", args }),
    },
    refreshSelTree: () => calls.push({ method: "refreshSelTree", args: [] }),
    ui: { multiSelected: new Set<string>() },
  }
}

describe("runBoardEffects — centralized effect interpreter", () => {
  it("SELECT effect calls sel.node.select", () => {
    const ctx = mockCtx()
    const result: ApplyResult = { state: state(), effects: [{ type: "SELECT", nodeId: "n1" }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([{ method: "sel.node.select", args: [["n1"]] }])
  })

  it("FOLD_SET effect calls setFoldDepths", () => {
    const ctx = mockCtx()
    const depths = new Map([["a", 2]])
    const result: ApplyResult = { state: state(), effects: [{ type: "FOLD_SET", depths }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([{ method: "setFoldDepths", args: [depths] }])
  })

  it("SCROLL_ANCHOR_CLEAR calls setUI", () => {
    const ctx = mockCtx()
    const result: ApplyResult = { state: state(), effects: [{ type: "SCROLL_ANCHOR_CLEAR" }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([{ method: "setUI", args: [{ columnScrollAnchor: null }] }])
  })

  it("REPO_MOVE_NODE calls repo.moveNode", () => {
    const ctx = mockCtx()
    const result: ApplyResult = {
      state: state(),
      effects: [{ type: "REPO_MOVE_NODE", nodeId: "n1", newParentId: "p1", sortOrder: 0.5 }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([{ method: "repo.moveNode", args: ["n1", "p1", 0.5] }])
  })

  it("REPO_ADD_NODE with selectAfter dispatches SELECT and enters edit", () => {
    const ctx = mockCtx()
    const nodeData = { content: "hello" }
    const result: ApplyResult = {
      state: state(),
      effects: [{ type: "REPO_ADD_NODE", parentId: "p1", node: nodeData, selectAfter: true }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toContainEqual({ method: "repo.addNode", args: ["p1", nodeData] })
    expect(ctx.calls).toContainEqual({
      method: "sel.node.select",
      args: [["new-node-id"]],
    })
    // Selection migration: edit mode is now via sel.text.edit() + textEditHints
    expect(ctx.sel.text()).not.toBeNull()
    expect(ctx.sel.text()?.nodeId).toBe("new-node-id")
    expect(ctx.textEditHints).toEqual({ blockIndex: 0 })
  })

  it("REPO_DELETE_NODE calls repo.deleteNode", () => {
    const ctx = mockCtx()
    const result: ApplyResult = { state: state(), effects: [{ type: "REPO_DELETE_NODE", nodeId: "n1" }] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([{ method: "repo.deleteNode", args: ["n1"] }])
  })

  it("REPO_UPDATE_NODE calls repo.updateNode with normalized updates", () => {
    const ctx = mockCtx()
    const result: ApplyResult = {
      state: state(),
      effects: [{ type: "REPO_UPDATE_NODE", nodeId: "n1", updates: { content: "new" } }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    // withTitle normalization auto-derives title from content
    expect(ctx.calls).toEqual([{ method: "repo.updateNode", args: ["n1", { content: "new", title: "new" }] }])
  })

  it("undo effects call undoHandle methods in order", () => {
    const ctx = mockCtx()
    const result: ApplyResult = {
      state: state(),
      effects: [
        { type: "UNDO_SET_CURSOR", nodeId: "cursor-1" },
        { type: "UNDO_START_BATCH", label: "Move" },
        { type: "REPO_MOVE_NODE", nodeId: "n1", newParentId: "p1", sortOrder: 0.5 },
        { type: "UNDO_END_BATCH" },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls.map((c) => c.method)).toEqual([
      "undoHandle.setCursor",
      "undoHandle.startBatch",
      "repo.moveNode",
      "undoHandle.endBatch",
    ])
  })

  it("handles multiple effects in order", () => {
    const ctx = mockCtx()
    const depths = new Map<string, number>()
    const result: ApplyResult = {
      state: state(),
      effects: [{ type: "FOLD_SET", depths }, { type: "SELECT", nodeId: "a" }, { type: "CLEAR_SELECTION" }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls.map((c) => c.method)).toEqual(["setFoldDepths", "sel.node.select", "setUI"])
  })

  it("no effects is a no-op", () => {
    const ctx = mockCtx()
    const result: ApplyResult = { state: state(), effects: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runBoardEffects(ctx as any, result)
    expect(ctx.calls).toEqual([])
  })
})
