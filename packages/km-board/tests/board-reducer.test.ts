/**
 * Board Reducer Tests
 *
 * Comprehensive test suite for board state management.
 * Tests state initialization, cursor selection, fold/collapse mechanics,
 * zoom behavior, navigation history, move mode, and edge cases.
 */

import { describe, it, expect } from "bun:test"
import { boardReducer, createBoardState } from "../src/board-reducer.ts"
import type { BoardAction } from "../src/board-types.ts"

// ===== State Initialization =====

describe("createBoardState", () => {
  it("creates initial state with null values", () => {
    const state = createBoardState()
    expect(state.rootId).toBeNull()
    expect(state.rootPath).toBeNull()
    expect(state.cursorNodeId).toBeNull()
  })

  it("creates state with provided values", () => {
    const state = createBoardState("root-123", "/path/to/file.md", "node-456")
    expect(state.rootId).toBe("root-123")
    expect(state.rootPath).toBe("/path/to/file.md")
    expect(state.cursorNodeId).toBe("node-456")
  })

  it("initializes empty collections", () => {
    const state = createBoardState()
    expect(state.selectedNodes.size).toBe(0)
    expect(state.foldedNodes.size).toBe(0)
    expect(state.collapsedNodes.size).toBe(0)
  })

  it("initializes empty navigation history", () => {
    const state = createBoardState()
    expect(state.navHistory).toEqual([])
    expect(state.navHistoryIndex).toBe(0)
  })

  it("initializes move mode as disabled", () => {
    const state = createBoardState()
    expect(state.moveMode).toBe(false)
    expect(state.moveSourceNodes).toEqual([])
    expect(state.moveSourceCursorNodeId).toBeNull()
  })

  it("initializes default view configuration", () => {
    const state = createBoardState()
    expect(state.maxOutlineDepth).toBe(99)
    expect(state.maxContentLines).toBe(2)
  })

  it("initializes sticky cursor as null", () => {
    const state = createBoardState()
    expect(state.curswantX).toBeNull()
    expect(state.curswantY).toBeNull()
  })
})

// ===== Cursor Selection =====

describe("SELECT action", () => {
  it("sets cursor to specified node", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "SELECT", nodeId: "node-123" })
    expect(newState.cursorNodeId).toBe("node-123")
  })

  it("allows null cursor", () => {
    const state = createBoardState("root", "/path", "node-1")
    const newState = boardReducer(state, { type: "SELECT", nodeId: null })
    expect(newState.cursorNodeId).toBeNull()
  })

  it("clears sticky cursor on selection", () => {
    const state = createBoardState()
    const withSticky = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    const selected = boardReducer(withSticky, {
      type: "SELECT",
      nodeId: "node-123",
    })
    expect(selected.curswantX).toBeNull()
    expect(selected.curswantY).toBeNull()
  })

  it("preserves other state properties", () => {
    const state = createBoardState("root-1", "/file.md", "node-1")
    const newState = boardReducer(state, { type: "SELECT", nodeId: "node-2" })
    expect(newState.rootId).toBe("root-1")
    expect(newState.rootPath).toBe("/file.md")
  })
})

// ===== Fold/Collapse =====

describe("TOGGLE_FOLD action", () => {
  it("adds node to folded set when not present", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "TOGGLE_FOLD",
      nodeId: "node-123",
    })
    expect(newState.foldedNodes.has("node-123")).toBe(true)
  })

  it("removes node from folded set when present", () => {
    const state = createBoardState()
    const folded = boardReducer(state, {
      type: "TOGGLE_FOLD",
      nodeId: "node-123",
    })
    const unfolded = boardReducer(folded, {
      type: "TOGGLE_FOLD",
      nodeId: "node-123",
    })
    expect(unfolded.foldedNodes.has("node-123")).toBe(false)
  })

  it("does not mutate original state", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "TOGGLE_FOLD",
      nodeId: "node-123",
    })
    expect(state.foldedNodes.size).toBe(0)
    expect(newState.foldedNodes.size).toBe(1)
  })

  it("handles multiple folded nodes independently", () => {
    const state = createBoardState()
    const state1 = boardReducer(state, {
      type: "TOGGLE_FOLD",
      nodeId: "node-1",
    })
    const state2 = boardReducer(state1, {
      type: "TOGGLE_FOLD",
      nodeId: "node-2",
    })
    expect(state2.foldedNodes.has("node-1")).toBe(true)
    expect(state2.foldedNodes.has("node-2")).toBe(true)
    expect(state2.foldedNodes.size).toBe(2)
  })
})

describe("TOGGLE_COLLAPSE action", () => {
  it("adds node to collapsed set when not present", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "TOGGLE_COLLAPSE",
      nodeId: "col-1",
    })
    expect(newState.collapsedNodes.has("col-1")).toBe(true)
  })

  it("removes node from collapsed set when present", () => {
    const state = createBoardState()
    const collapsed = boardReducer(state, {
      type: "TOGGLE_COLLAPSE",
      nodeId: "col-1",
    })
    const expanded = boardReducer(collapsed, {
      type: "TOGGLE_COLLAPSE",
      nodeId: "col-1",
    })
    expect(expanded.collapsedNodes.has("col-1")).toBe(false)
  })

  it("keeps collapse and fold state separate", () => {
    const state = createBoardState()
    const folded = boardReducer(state, {
      type: "TOGGLE_FOLD",
      nodeId: "node-1",
    })
    const collapsed = boardReducer(folded, {
      type: "TOGGLE_COLLAPSE",
      nodeId: "node-1",
    })
    expect(collapsed.foldedNodes.has("node-1")).toBe(true)
    expect(collapsed.collapsedNodes.has("node-1")).toBe(true)
  })
})

// ===== Zoom =====

describe("ZOOM_IN action", () => {
  it("changes root to specified node", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: "new-root",
    })
    expect(newState.rootId).toBe("new-root")
  })

  it("sets cursor to provided cursorNodeId", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: "new-root",
      cursorNodeId: "new-cursor",
    })
    expect(newState.cursorNodeId).toBe("new-cursor")
  })

  it("sets cursor to null when cursorNodeId not provided", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: "new-root",
    })
    expect(newState.cursorNodeId).toBeNull()
  })

  it("clears sticky cursor on zoom", () => {
    const state = createBoardState()
    const withSticky = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    const zoomed = boardReducer(withSticky, {
      type: "ZOOM_IN",
      nodeId: "new-root",
    })
    expect(zoomed.curswantX).toBeNull()
    expect(zoomed.curswantY).toBeNull()
  })

  it("allows null node ID for zoom", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: null,
    })
    expect(newState.rootId).toBeNull()
  })
})

// ===== Root Change =====

describe("SET_ROOT action", () => {
  it("changes root to new file", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    expect(newState.rootId).toBe("root-2")
    expect(newState.rootPath).toBe("/file2.md")
    expect(newState.cursorNodeId).toBe("cursor-2")
  })

  it("adds current state to navigation history", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    expect(newState.navHistory).toHaveLength(1)
    expect(newState.navHistory[0]).toEqual({
      rootId: "root-1",
      rootPath: "/file1.md",
      cursorNodeId: "cursor-1",
    })
  })

  it("increments history index", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    expect(newState.navHistoryIndex).toBe(1)
  })

  it("truncates history on non-linear navigation", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const state2 = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    const state3 = boardReducer(state2, {
      type: "SET_ROOT",
      rootId: "root-3",
      rootPath: "/file3.md",
      cursorNodeId: "cursor-3",
    })

    // Go back in history (simulated by manually setting index)
    const stateBack = { ...state3, navHistoryIndex: 0 }

    // Navigate to new location - should truncate future history
    const stateBranch = boardReducer(stateBack, {
      type: "SET_ROOT",
      rootId: "root-branch",
      rootPath: "/file-branch.md",
      cursorNodeId: "cursor-branch",
    })

    expect(stateBranch.navHistory).toHaveLength(2)
    expect(stateBranch.navHistory[1]?.rootId).toBe("root-3")
  })

  it("clears sticky cursor on root change", () => {
    const state = createBoardState()
    const withSticky = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    const changed = boardReducer(withSticky, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    expect(changed.curswantX).toBeNull()
    expect(changed.curswantY).toBeNull()
  })
})

// ===== Selection =====

describe("SELECT_NODE_ADD action", () => {
  it("adds node to selection", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    expect(newState.selectedNodes.has("node-1")).toBe(true)
  })

  it("preserves existing selections", () => {
    const state = createBoardState()
    const state1 = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const state2 = boardReducer(state1, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    expect(state2.selectedNodes.has("node-1")).toBe(true)
    expect(state2.selectedNodes.has("node-2")).toBe(true)
  })

  it("does not mutate original state", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    expect(state.selectedNodes.size).toBe(0)
    expect(newState.selectedNodes.size).toBe(1)
  })
})

describe("SELECT_NODE_REMOVE action", () => {
  it("removes node from selection", () => {
    const state = createBoardState()
    const selected = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const removed = boardReducer(selected, {
      type: "SELECT_NODE_REMOVE",
      nodeId: "node-1",
    })
    expect(removed.selectedNodes.has("node-1")).toBe(false)
  })

  it("preserves other selections", () => {
    const state = createBoardState()
    const state1 = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const state2 = boardReducer(state1, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    const removed = boardReducer(state2, {
      type: "SELECT_NODE_REMOVE",
      nodeId: "node-1",
    })
    expect(removed.selectedNodes.has("node-1")).toBe(false)
    expect(removed.selectedNodes.has("node-2")).toBe(true)
  })

  it("does nothing if node not in selection", () => {
    const state = createBoardState()
    const removed = boardReducer(state, {
      type: "SELECT_NODE_REMOVE",
      nodeId: "node-1",
    })
    expect(removed.selectedNodes.size).toBe(0)
  })
})

describe("SELECT_NODE_TOGGLE action", () => {
  it("adds node when not selected", () => {
    const state = createBoardState()
    const toggled = boardReducer(state, {
      type: "SELECT_NODE_TOGGLE",
      nodeId: "node-1",
    })
    expect(toggled.selectedNodes.has("node-1")).toBe(true)
  })

  it("removes node when already selected", () => {
    const state = createBoardState()
    const selected = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const toggled = boardReducer(selected, {
      type: "SELECT_NODE_TOGGLE",
      nodeId: "node-1",
    })
    expect(toggled.selectedNodes.has("node-1")).toBe(false)
  })

  it("preserves other selections", () => {
    const state = createBoardState()
    const state1 = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const state2 = boardReducer(state1, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    const toggled = boardReducer(state2, {
      type: "SELECT_NODE_TOGGLE",
      nodeId: "node-1",
    })
    expect(toggled.selectedNodes.has("node-1")).toBe(false)
    expect(toggled.selectedNodes.has("node-2")).toBe(true)
  })
})

describe("CLEAR_SELECTION action", () => {
  it("clears all selections", () => {
    const state = createBoardState()
    const state1 = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const state2 = boardReducer(state1, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    const cleared = boardReducer(state2, { type: "CLEAR_SELECTION" })
    expect(cleared.selectedNodes.size).toBe(0)
  })

  it("does nothing when no selections", () => {
    const state = createBoardState()
    const cleared = boardReducer(state, { type: "CLEAR_SELECTION" })
    expect(cleared.selectedNodes.size).toBe(0)
  })
})

// ===== Move Mode =====

describe("ENTER_MOVE_MODE action", () => {
  it("enables move mode with node IDs", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1", "node-2"],
      cursorNodeId: "cursor-1",
    })
    expect(newState.moveMode).toBe(true)
    expect(newState.moveSourceNodes).toEqual(["node-1", "node-2"])
    expect(newState.moveSourceCursorNodeId).toBe("cursor-1")
  })

  it("does nothing with empty node array", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: [],
      cursorNodeId: "cursor-1",
    })
    expect(newState.moveMode).toBe(false)
    expect(newState.moveSourceNodes).toEqual([])
  })

  it("accepts null cursor node ID", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: null,
    })
    expect(newState.moveMode).toBe(true)
    expect(newState.moveSourceCursorNodeId).toBeNull()
  })
})

describe("CONFIRM_MOVE action", () => {
  it("disables move mode", () => {
    const state = createBoardState()
    const moveMode = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: "cursor-1",
    })
    const confirmed = boardReducer(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.moveMode).toBe(false)
  })

  it("clears move source nodes", () => {
    const state = createBoardState()
    const moveMode = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1", "node-2"],
      cursorNodeId: "cursor-1",
    })
    const confirmed = boardReducer(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.moveSourceNodes).toEqual([])
    expect(confirmed.moveSourceCursorNodeId).toBeNull()
  })

  it("clears selection after move", () => {
    const state = createBoardState()
    const selected = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const moveMode = boardReducer(selected, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: "cursor-1",
    })
    const confirmed = boardReducer(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.selectedNodes.size).toBe(0)
  })
})

describe("CANCEL_MOVE action", () => {
  it("disables move mode", () => {
    const state = createBoardState()
    const moveMode = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: "cursor-1",
    })
    const cancelled = boardReducer(moveMode, { type: "CANCEL_MOVE" })
    expect(cancelled.moveMode).toBe(false)
  })

  it("restores original cursor position", () => {
    const state = createBoardState("root", "/path", "original-cursor")
    const moved = boardReducer(state, { type: "SELECT", nodeId: "new-cursor" })
    const moveMode = boardReducer(moved, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: "original-cursor",
    })
    const cancelled = boardReducer(moveMode, { type: "CANCEL_MOVE" })
    expect(cancelled.cursorNodeId).toBe("original-cursor")
  })

  it("keeps current cursor if no source cursor", () => {
    const state = createBoardState("root", "/path", "current-cursor")
    const moveMode = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: null,
    })
    const cancelled = boardReducer(moveMode, { type: "CANCEL_MOVE" })
    expect(cancelled.cursorNodeId).toBe("current-cursor")
  })

  it("clears sticky cursor", () => {
    const state = createBoardState()
    const withSticky = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    const moveMode = boardReducer(withSticky, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: null,
    })
    const cancelled = boardReducer(moveMode, { type: "CANCEL_MOVE" })
    expect(cancelled.curswantX).toBeNull()
    expect(cancelled.curswantY).toBeNull()
  })
})

// ===== View Configuration =====

describe("INCREASE_OUTLINE_DEPTH action", () => {
  it("increases outline depth by 1", () => {
    const state = createBoardState()
    const initialState = { ...state, maxOutlineDepth: 5 }
    const newState = boardReducer(initialState, {
      type: "INCREASE_OUTLINE_DEPTH",
    })
    expect(newState.maxOutlineDepth).toBe(6)
  })

  it("does not exceed maximum of 99", () => {
    const state = createBoardState()
    const maxState = { ...state, maxOutlineDepth: 99 }
    const newState = boardReducer(maxState, { type: "INCREASE_OUTLINE_DEPTH" })
    expect(newState.maxOutlineDepth).toBe(99)
  })
})

describe("DECREASE_OUTLINE_DEPTH action", () => {
  it("decreases outline depth by 1", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "DECREASE_OUTLINE_DEPTH" })
    expect(newState.maxOutlineDepth).toBe(98)
  })

  it("does not go below 0", () => {
    const state = createBoardState()
    const minState = { ...state, maxOutlineDepth: 0 }
    const newState = boardReducer(minState, { type: "DECREASE_OUTLINE_DEPTH" })
    expect(newState.maxOutlineDepth).toBe(0)
  })
})

describe("INCREASE_CONTENT_LINES action", () => {
  it("increases content lines by 1", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "INCREASE_CONTENT_LINES" })
    expect(newState.maxContentLines).toBe(3)
  })

  it("does not exceed maximum of 10", () => {
    const state = createBoardState()
    const maxState = { ...state, maxContentLines: 10 }
    const newState = boardReducer(maxState, { type: "INCREASE_CONTENT_LINES" })
    expect(newState.maxContentLines).toBe(10)
  })
})

describe("DECREASE_CONTENT_LINES action", () => {
  it("decreases content lines by 1", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "DECREASE_CONTENT_LINES" })
    expect(newState.maxContentLines).toBe(1)
  })

  it("does not go below 0", () => {
    const state = createBoardState()
    const minState = { ...state, maxContentLines: 0 }
    const newState = boardReducer(minState, { type: "DECREASE_CONTENT_LINES" })
    expect(newState.maxContentLines).toBe(0)
  })
})

// ===== Sticky Cursor (curswant) =====

describe("SET_CURSWANT action", () => {
  it("sets both x and y coordinates", () => {
    const state = createBoardState()
    const newState = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    expect(newState.curswantX).toBe(5)
    expect(newState.curswantY).toBe(10)
  })

  it("sets only x coordinate when y not provided", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "SET_CURSWANT", x: 5 })
    expect(newState.curswantX).toBe(5)
    expect(newState.curswantY).toBeNull()
  })

  it("sets only y coordinate when x not provided", () => {
    const state = createBoardState()
    const newState = boardReducer(state, { type: "SET_CURSWANT", y: 10 })
    expect(newState.curswantX).toBeNull()
    expect(newState.curswantY).toBe(10)
  })

  it("preserves existing x when setting only y", () => {
    const state = createBoardState()
    const withX = boardReducer(state, { type: "SET_CURSWANT", x: 5 })
    const withY = boardReducer(withX, { type: "SET_CURSWANT", y: 10 })
    expect(withY.curswantX).toBe(5)
    expect(withY.curswantY).toBe(10)
  })

  it("preserves existing y when setting only x", () => {
    const state = createBoardState()
    const withY = boardReducer(state, { type: "SET_CURSWANT", y: 10 })
    const withX = boardReducer(withY, { type: "SET_CURSWANT", x: 5 })
    expect(withX.curswantX).toBe(5)
    expect(withX.curswantY).toBe(10)
  })

  it("allows setting to null explicitly", () => {
    const state = createBoardState()
    const withBoth = boardReducer(state, {
      type: "SET_CURSWANT",
      x: 5,
      y: 10,
    })
    const cleared = boardReducer(withBoth, {
      type: "SET_CURSWANT",
      x: null,
      y: null,
    })
    expect(cleared.curswantX).toBeNull()
    expect(cleared.curswantY).toBeNull()
  })
})

// ===== Error Handling =====

describe("Error handling", () => {
  it("throws on unhandled action type", () => {
    const state = createBoardState()
    const invalidAction = { type: "INVALID_ACTION" } as unknown as BoardAction
    expect(() => boardReducer(state, invalidAction)).toThrow(
      /Unhandled action: INVALID_ACTION/,
    )
  })
})

// ===== Edge Cases =====

describe("Edge cases", () => {
  it("handles rapid state transitions", () => {
    const state = createBoardState()

    // Rapid sequence of operations
    let current = state
    for (let i = 0; i < 100; i++) {
      current = boardReducer(current, {
        type: "SELECT",
        nodeId: `node-${i}`,
      })
    }

    expect(current.cursorNodeId).toBe("node-99")
  })

  it("handles complex state combinations", () => {
    const state = createBoardState("root", "/file.md", "cursor")

    // Build complex state
    let complex = state
    complex = boardReducer(complex, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    complex = boardReducer(complex, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    complex = boardReducer(complex, { type: "TOGGLE_FOLD", nodeId: "node-1" })
    complex = boardReducer(complex, {
      type: "TOGGLE_COLLAPSE",
      nodeId: "col-1",
    })
    complex = boardReducer(complex, { type: "SET_CURSWANT", x: 5, y: 10 })

    expect(complex.selectedNodes.size).toBe(2)
    expect(complex.foldedNodes.size).toBe(1)
    expect(complex.collapsedNodes.size).toBe(1)
    expect(complex.curswantX).toBe(5)
    expect(complex.curswantY).toBe(10)
  })

  it("maintains immutability across all operations", () => {
    const state = createBoardState()

    // Save reference to original state
    const original = state

    // Perform various operations
    boardReducer(state, { type: "SELECT", nodeId: "node-1" })
    boardReducer(state, { type: "TOGGLE_FOLD", nodeId: "node-1" })
    boardReducer(state, { type: "SELECT_NODE_ADD", nodeId: "node-1" })

    // Original state should be unchanged
    expect(original.cursorNodeId).toBeNull()
    expect(original.foldedNodes.size).toBe(0)
    expect(original.selectedNodes.size).toBe(0)
  })

  it("handles empty board state transitions", () => {
    const state = createBoardState()

    // Operations on empty state should work
    const selected = boardReducer(state, { type: "SELECT", nodeId: null })
    expect(selected.cursorNodeId).toBeNull()

    const cleared = boardReducer(state, { type: "CLEAR_SELECTION" })
    expect(cleared.selectedNodes.size).toBe(0)

    const cancelled = boardReducer(state, { type: "CANCEL_MOVE" })
    expect(cancelled.moveMode).toBe(false)
  })
})

// ===== Integration Scenarios =====

describe("Integration scenarios", () => {
  it("typical navigation flow", () => {
    // Start with initial state
    let state = createBoardState("root-1", "/file1.md", null)

    // Select first node
    state = boardReducer(state, { type: "SELECT", nodeId: "node-1" })
    expect(state.cursorNodeId).toBe("node-1")

    // Fold a node
    state = boardReducer(state, { type: "TOGGLE_FOLD", nodeId: "node-1" })
    expect(state.foldedNodes.has("node-1")).toBe(true)

    // Zoom into a node
    state = boardReducer(state, {
      type: "ZOOM_IN",
      nodeId: "node-2",
      cursorNodeId: "node-2-child",
    })
    expect(state.rootId).toBe("node-2")
    expect(state.cursorNodeId).toBe("node-2-child")
  })

  it("multi-select and move workflow", () => {
    let state = createBoardState("root", "/file.md", "cursor-1")

    // Multi-select nodes
    state = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    state = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-2",
    })
    state = boardReducer(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-3",
    })
    expect(state.selectedNodes.size).toBe(3)

    // Enter move mode
    state = boardReducer(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1", "node-2", "node-3"],
      cursorNodeId: "cursor-1",
    })
    expect(state.moveMode).toBe(true)
    expect(state.moveSourceNodes).toHaveLength(3)

    // Navigate to destination
    state = boardReducer(state, { type: "SELECT", nodeId: "destination" })

    // Confirm move
    state = boardReducer(state, { type: "CONFIRM_MOVE" })
    expect(state.moveMode).toBe(false)
    expect(state.selectedNodes.size).toBe(0)
  })

  it("navigation history flow", () => {
    let state = createBoardState("root-1", "/file1.md", "cursor-1")

    // Navigate to second file
    state = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-2",
      rootPath: "/file2.md",
      cursorNodeId: "cursor-2",
    })
    expect(state.navHistory).toHaveLength(1)
    expect(state.navHistoryIndex).toBe(1)

    // Navigate to third file
    state = boardReducer(state, {
      type: "SET_ROOT",
      rootId: "root-3",
      rootPath: "/file3.md",
      cursorNodeId: "cursor-3",
    })
    expect(state.navHistory).toHaveLength(2)
    expect(state.navHistoryIndex).toBe(2)

    // Verify history entries
    expect(state.navHistory[0]?.rootId).toBe("root-1")
    expect(state.navHistory[1]?.rootId).toBe("root-2")
  })

  it("view configuration adjustment", () => {
    let state = createBoardState()
    // Start with lower depth to test increase
    state = { ...state, maxOutlineDepth: 5 }

    // Increase outline depth several times
    state = boardReducer(state, { type: "INCREASE_OUTLINE_DEPTH" })
    state = boardReducer(state, { type: "INCREASE_OUTLINE_DEPTH" })
    expect(state.maxOutlineDepth).toBe(7)

    // Increase content lines
    state = boardReducer(state, { type: "INCREASE_CONTENT_LINES" })
    state = boardReducer(state, { type: "INCREASE_CONTENT_LINES" })
    expect(state.maxContentLines).toBe(4)

    // Decrease back
    state = boardReducer(state, { type: "DECREASE_OUTLINE_DEPTH" })
    state = boardReducer(state, { type: "DECREASE_CONTENT_LINES" })
    expect(state.maxOutlineDepth).toBe(6)
    expect(state.maxContentLines).toBe(3)
  })

  it("sticky cursor across navigation", () => {
    let state = createBoardState("root", "/file.md", "cursor-1")

    // Set sticky cursor for column navigation
    state = boardReducer(state, { type: "SET_CURSWANT", x: 2, y: 5 })
    expect(state.curswantX).toBe(2)
    expect(state.curswantY).toBe(5)

    // Navigate with sticky cursor preserved (manual navigation)
    state = boardReducer(state, { type: "SET_CURSWANT", y: 6 })
    expect(state.curswantX).toBe(2)
    expect(state.curswantY).toBe(6)

    // Explicit selection clears sticky cursor
    state = boardReducer(state, { type: "SELECT", nodeId: "new-cursor" })
    expect(state.curswantX).toBeNull()
    expect(state.curswantY).toBeNull()
  })
})
