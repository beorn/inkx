/**
 * Board Reducer — Pure State Tests
 *
 * Tests for the Board.apply() pure navigation reducer.
 * No React, no Repo, no side effects — just state in, state out.
 *
 * See docs/design/tea-state-machines.md for the TEA vision.
 */

import { describe, it, expect, beforeEach } from "vitest"
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
  type BoardEditOp,
  type IndentContext,
  type OutdentContext,
  type InsertNodeContext,
  type DeleteNodeContext,
  type MoveNodeContext,
  type ToggleStatusContext,
} from "../src/board/board-reducer.ts"
import {
  withHistory,
  createBoardStateWithHistory,
  createHistoryState,
  undoOp,
  redoOp,
  canUndo,
  canRedo,
  HISTORY_GROUP_WINDOW_MS,
  HISTORY_MAX_UNDOS,
  type BoardStateWithHistory,
} from "../src/board/history-plugin.ts"

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

// =============================================================================
// Edit Operations — Phase 2
// =============================================================================

describe("Board.apply — INDENT_NODE", () => {
  it("emits REPO_MOVE_NODE effect for single node", () => {
    const s = state({ cursorNodeId: "card-b" })
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
    const s = state({ cursorNodeId: "card-c" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.state.cursorNodeId).toBe("card-b")
  })

  it("emits CLEAR_SELECTION for batch indent", () => {
    const s = state({ cursorNodeId: "card-b" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "CLEAR_SELECTION")).toBe(true)
  })

  it("emits UNDO_START_BATCH/UNDO_END_BATCH for multiple nodes", () => {
    const s = state({ cursorNodeId: "card-b" })
    const nodes: IndentContext[] = [
      { nodeId: "card-b", newParentId: "card-a", sortOrder: 0 },
      { nodeId: "card-c", newParentId: "card-a", sortOrder: 1 },
    ]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("no-op for empty nodes list", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBoard(s, { type: "INDENT_NODE", nodes: [] })
    expect(result.effects).toEqual([])
  })

  it("does not emit batch markers for single node", () => {
    const s = state({ cursorNodeId: "card-b" })
    const nodes: IndentContext[] = [{ nodeId: "card-b", newParentId: "card-a", sortOrder: 0 }]
    const result = applyBoard(s, { type: "INDENT_NODE", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(false)
  })
})

describe("Board.apply — OUTDENT_NODE", () => {
  it("emits REPO_MOVE_NODE effect for single node", () => {
    const s = state({ cursorNodeId: "sub-item" })
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
    const s = state({ cursorNodeId: "sub-b" })
    const nodes: OutdentContext[] = [
      { nodeId: "sub-a", newParentId: "col-1", sortOrder: 1 },
      { nodeId: "sub-b", newParentId: "col-1", sortOrder: 2 },
    ]
    const result = applyBoard(s, { type: "OUTDENT_NODE", nodes })
    expect(result.state.cursorNodeId).toBe("sub-a")
  })

  it("no-op for empty nodes list", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBoard(s, { type: "OUTDENT_NODE", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — INSERT_NODE", () => {
  it("emits REPO_ADD_NODE effect", () => {
    const s = state({ cursorNodeId: "card-a" })
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
    const s = state({ cursorNodeId: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "p", content: "" },
      enterEdit: true,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })
    expect(result.effects.some((e) => e.type === "RENDER_FLUSH")).toBe(true)
  })

  it("does not emit RENDER_FLUSH when enterEdit is false", () => {
    const s = state({ cursorNodeId: "card-a" })
    const context: InsertNodeContext = {
      parentId: "col-1",
      node: { type: "h", content: "New section" },
      enterEdit: false,
    }
    const result = applyBoard(s, { type: "INSERT_NODE", context })
    expect(result.effects.some((e) => e.type === "RENDER_FLUSH")).toBe(false)
  })

  it("emits UNDO_SET_CURSOR for undo tracking", () => {
    const s = state({ cursorNodeId: "card-a" })
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
    const s = state({ cursorNodeId: "card-a" })
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
    const s = state({ cursorNodeId: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.state.cursorNodeId).toBe("card-b")
  })

  it("falls back to current cursor when no target", () => {
    const s = state({ cursorNodeId: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-b"],
      cursorTarget: null,
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.state.cursorNodeId).toBe("card-a")
  })

  it("emits undo batch markers", () => {
    const s = state({ cursorNodeId: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("emits CLEAR_SELECTION", () => {
    const s = state({ cursorNodeId: "card-a" })
    const context: DeleteNodeContext = {
      nodeIds: ["card-a"],
      cursorTarget: "card-b",
    }
    const result = applyBoard(s, { type: "DELETE_NODE", context })
    expect(result.effects.some((e) => e.type === "CLEAR_SELECTION")).toBe(true)
  })

  it("no-op for empty nodeIds", () => {
    const s = state({ cursorNodeId: "card-a" })
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
    const s = state({ cursorNodeId: "task-1" })
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
    const s = state({ cursorNodeId: "task-1" })
    const nodes: ToggleStatusContext[] = [
      {
        nodeId: "task-1",
        nextStatus: "wip",
        marker: "[/]",
        itemUpdate: { item: { task: { status: "wip", marker: "[/]" } } },
      },
    ]
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes })
    expect(result.state.cursorNodeId).toBe("task-1")
  })

  it("emits SELECT to trigger UI update", () => {
    const s = state({ cursorNodeId: "task-1" })
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
    const s = state({ cursorNodeId: "task-1" })
    const result = applyBoard(s, { type: "TOGGLE_TASK_STATUS", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

describe("Board.apply — MOVE_NODE_UP / MOVE_NODE_DOWN", () => {
  it("emits REPO_MOVE_NODE effects for move up", () => {
    const s = state({ cursorNodeId: "card-b" })
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
    const s = state({ cursorNodeId: "card-a" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-a", parentId: "col-1", sortOrder: 1.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_DOWN", nodes })

    const moveEffects = result.effects.filter((e) => e.type === "REPO_MOVE_NODE")
    expect(moveEffects).toHaveLength(1)
  })

  it("emits undo batch markers", () => {
    const s = state({ cursorNodeId: "card-a" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-a", parentId: "col-1", sortOrder: 1.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes })
    expect(result.effects.some((e) => e.type === "UNDO_START_BATCH")).toBe(true)
    expect(result.effects.some((e) => e.type === "UNDO_END_BATCH")).toBe(true)
  })

  it("preserves cursor after move", () => {
    const s = state({ cursorNodeId: "card-b" })
    const nodes: MoveNodeContext[] = [{ nodeId: "card-b", parentId: "col-1", sortOrder: -0.5 }]
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes })
    expect(result.state.cursorNodeId).toBe("card-b")
  })

  it("no-op for empty nodes", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBoard(s, { type: "MOVE_NODE_UP", nodes: [] })
    expect(result.effects).toEqual([])
  })
})

// =============================================================================
// applyBoard combined dispatcher
// =============================================================================

describe("Board.apply — combined dispatcher", () => {
  it("routes navigation ops to applyNavigation", () => {
    const s = state({ cursorNodeId: "a" })
    const result = applyBoard(s, { type: "SELECT", nodeId: "b" })
    expect(result.state.cursorNodeId).toBe("b")
  })

  it("routes edit ops to applyEdit", () => {
    const s = state({ cursorNodeId: "card-a" })
    const result = applyBoard(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev-sibling", sortOrder: 0 }],
    })
    expect(result.effects.some((e) => e.type === "REPO_MOVE_NODE")).toBe(true)
  })
})

// =============================================================================
// withHistory plugin
// =============================================================================

describe("withHistory plugin", () => {
  // Fixed time for deterministic tests
  let time: number
  const clock = () => time
  const apply = withHistory(applyBoard, clock)

  function historyState(overrides: Partial<BoardNavState> = {}): BoardStateWithHistory {
    return createBoardStateWithHistory(state(overrides))
  }

  beforeEach(() => {
    time = 1000
  })

  it("records edit ops in history", () => {
    const s = historyState({ cursorNodeId: "card-a" })
    const result = apply(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev", sortOrder: 0 }],
    })
    expect(result.state.history.undos).toHaveLength(1)
    expect(result.state.history.undos[0]!.op.type).toBe("INDENT_NODE")
  })

  it("does not record navigation ops in history", () => {
    const s = historyState({ cursorNodeId: "a" })
    const result = apply(s, { type: "SELECT", nodeId: "b" })
    expect(result.state.history.undos).toHaveLength(0)
  })

  it("preserves history state through navigation ops", () => {
    let s = historyState({ cursorNodeId: "card-a" })
    // Edit op
    const r1 = apply(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev", sortOrder: 0 }],
    })
    s = r1.state
    // Navigation op
    const r2 = apply(s, { type: "SELECT", nodeId: "card-b" })
    expect(r2.state.history.undos).toHaveLength(1)
  })

  it("records cursorBefore and cursorAfter", () => {
    const s = historyState({ cursorNodeId: "before-cursor" })
    const result = apply(s, {
      type: "DELETE_NODE",
      context: { nodeIds: ["card-x"], cursorTarget: "after-cursor" },
    })
    const entry = result.state.history.undos[0]!
    expect(entry.cursorBefore).toBe("before-cursor")
    expect(entry.cursorAfter).toBe("after-cursor")
  })

  it("clears redo stack on new edit", () => {
    const initial = historyState({ cursorNodeId: "card-a" })
    // Create some history with a redo entry
    const h: BoardStateWithHistory = {
      ...initial,
      history: {
        undos: [],
        redos: [
          {
            op: { type: "INDENT_NODE", nodes: [] },
            cursorBefore: null,
            cursorAfter: null,
            timestamp: 0,
          },
        ],
      },
    }
    const result = apply(h, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev", sortOrder: 0 }],
    })
    expect(result.state.history.redos).toHaveLength(0)
    expect(result.state.history.undos).toHaveLength(1)
  })

  it("groups rapid edits within time window", () => {
    let s = historyState({ cursorNodeId: "task-1" })

    // First toggle
    time = 1000
    const r1 = apply(s, {
      type: "TOGGLE_TASK_STATUS",
      nodes: [{ nodeId: "task-1", nextStatus: "wip", marker: "[/]", itemUpdate: {} }],
    })
    s = r1.state

    // Second toggle within window
    time = 1000 + HISTORY_GROUP_WINDOW_MS - 1
    const r2 = apply(s, {
      type: "TOGGLE_TASK_STATUS",
      nodes: [{ nodeId: "task-1", nextStatus: "done", marker: "[x]", itemUpdate: {} }],
    })

    // Should be grouped into one entry
    expect(r2.state.history.undos).toHaveLength(1)
  })

  it("does not group edits beyond time window", () => {
    let s = historyState({ cursorNodeId: "task-1" })

    time = 1000
    const r1 = apply(s, {
      type: "TOGGLE_TASK_STATUS",
      nodes: [{ nodeId: "task-1", nextStatus: "wip", marker: "[/]", itemUpdate: {} }],
    })
    s = r1.state

    // Beyond the window
    time = 1000 + HISTORY_GROUP_WINDOW_MS + 1
    const r2 = apply(s, {
      type: "TOGGLE_TASK_STATUS",
      nodes: [{ nodeId: "task-1", nextStatus: "done", marker: "[x]", itemUpdate: {} }],
    })

    expect(r2.state.history.undos).toHaveLength(2)
  })

  it("does not group different operation types", () => {
    let s = historyState({ cursorNodeId: "card-a" })

    time = 1000
    const r1 = apply(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev", sortOrder: 0 }],
    })
    s = r1.state

    // Different op type, within window
    time = 1000 + 10
    const r2 = apply(s, {
      type: "DELETE_NODE",
      context: { nodeIds: ["card-b"], cursorTarget: "card-a" },
    })

    expect(r2.state.history.undos).toHaveLength(2)
  })

  it("enforces max undo capacity", () => {
    let s = historyState({ cursorNodeId: "card-a" })

    for (let i = 0; i < HISTORY_MAX_UNDOS + 20; i++) {
      time = i * 1000 // Each well beyond grouping window
      const r = apply(s, {
        type: "INDENT_NODE",
        nodes: [{ nodeId: `card-${i}`, newParentId: "prev", sortOrder: i }],
      })
      s = r.state
    }

    expect(s.history.undos.length).toBeLessThanOrEqual(HISTORY_MAX_UNDOS)
  })

  it("preserves inner reducer effects", () => {
    const s = historyState({ cursorNodeId: "card-a" })
    const result = apply(s, {
      type: "INDENT_NODE",
      nodes: [{ nodeId: "card-a", newParentId: "prev", sortOrder: 0 }],
    })
    // Should still have REPO_MOVE_NODE from inner reducer
    expect(result.effects.some((e) => e.type === "REPO_MOVE_NODE")).toBe(true)
  })
})

// =============================================================================
// undoOp / redoOp
// =============================================================================

describe("undoOp / redoOp", () => {
  const entry1 = {
    op: { type: "INDENT_NODE" as const, nodes: [] },
    cursorBefore: "a",
    cursorAfter: "b",
    timestamp: 1000,
  }
  const entry2 = {
    op: { type: "DELETE_NODE" as const, context: { nodeIds: ["x"], cursorTarget: "y" } },
    cursorBefore: "b",
    cursorAfter: "y",
    timestamp: 2000,
  }

  it("undoOp pops last entry from undos and pushes to redos", () => {
    const h = { undos: [entry1, entry2], redos: [] }
    const result = undoOp(h)
    expect(result.entry).toBe(entry2)
    expect(result.history.undos).toHaveLength(1)
    expect(result.history.redos).toHaveLength(1)
    expect(result.history.redos[0]).toBe(entry2)
  })

  it("undoOp returns null entry when stack empty", () => {
    const h = { undos: [], redos: [] }
    const result = undoOp(h)
    expect(result.entry).toBeNull()
    expect(result.history).toBe(h)
  })

  it("redoOp pops last entry from redos and pushes to undos", () => {
    const h = { undos: [], redos: [entry1] }
    const result = redoOp(h)
    expect(result.entry).toBe(entry1)
    expect(result.history.undos).toHaveLength(1)
    expect(result.history.redos).toHaveLength(0)
  })

  it("redoOp returns null entry when stack empty", () => {
    const h = { undos: [], redos: [] }
    const result = redoOp(h)
    expect(result.entry).toBeNull()
    expect(result.history).toBe(h)
  })

  it("canUndo/canRedo report correctly", () => {
    expect(canUndo({ undos: [entry1], redos: [] })).toBe(true)
    expect(canUndo({ undos: [], redos: [entry1] })).toBe(false)
    expect(canRedo({ undos: [], redos: [entry1] })).toBe(true)
    expect(canRedo({ undos: [entry1], redos: [] })).toBe(false)
  })

  it("undo then redo roundtrip preserves entries", () => {
    const h = { undos: [entry1, entry2], redos: [] }
    const afterUndo = undoOp(h)
    const afterRedo = redoOp(afterUndo.history)
    expect(afterRedo.history.undos).toHaveLength(2)
    expect(afterRedo.history.redos).toHaveLength(0)
  })
})
