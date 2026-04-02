/**
 * Board Reducer Tests
 *
 * Comprehensive test suite for board state management.
 * Tests state initialization, cursor selection, fold/collapse mechanics,
 * zoom behavior, navigation history, move mode, and edge cases.
 */

import { describe, it, expect } from "vitest"
import { boardReducer, createBoardState } from "../src/board-reducer.ts"
import type { BoardAction, BoardState } from "../src/board-types.ts"

// ===== Test Helpers =====

/** Dispatch helper that wraps reducer call pattern */
const dispatch = (state: BoardState, action: BoardAction): BoardState => boardReducer(state, action)

/** Chain multiple actions through the reducer */
const dispatchAll = (state: BoardState, actions: BoardAction[]): BoardState =>
  actions.reduce((s, action) => dispatch(s, action), state)

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
    expect(state.foldDepths.size).toBe(0)
    expect(state.collapsedNodes.size).toBe(0)
  })

  it("initializes empty navigation history", () => {
    const state = createBoardState()
    expect(state.navHistory).toEqual([])
    expect(state.navHistoryIndex).toBe(0)
  })

  it("initializes move mode as disabled", () => {
    const state = createBoardState()
    expect(state.moveState).toEqual({ active: false })
  })

  it("initializes default view configuration", () => {
    const state = createBoardState()
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
    const newState = dispatch(state, { type: "SELECT", nodeId: "node-123" })
    expect(newState.cursorNodeId).toBe("node-123")
  })

  it("allows null cursor", () => {
    const state = createBoardState("root", "/path", "node-1")
    const newState = dispatch(state, { type: "SELECT", nodeId: null })
    expect(newState.cursorNodeId).toBeNull()
  })

  it("clears sticky cursor on selection", () => {
    const state = createBoardState()
    const selected = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "SELECT", nodeId: "node-123" },
    ])
    expect(selected.curswantX).toBeNull()
    expect(selected.curswantY).toBeNull()
  })

  it("preserves other state properties", () => {
    const state = createBoardState("root-1", "/file.md", "node-1")
    const newState = dispatch(state, { type: "SELECT", nodeId: "node-2" })
    expect(newState.rootId).toBe("root-1")
    expect(newState.rootPath).toBe("/file.md")
  })
})

// ===== Toggle Actions (Fold/Collapse) =====

describe.each([
  {
    actionType: "TOGGLE_FOLD" as const,
    setName: "foldDepths" as const,
    nodeId: "node-123",
  },
  {
    actionType: "TOGGLE_COLLAPSE" as const,
    setName: "collapsedNodes" as const,
    nodeId: "col-1",
  },
])("$actionType action", ({ actionType, setName, nodeId }) => {
  it("adds node to set when not present", () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: actionType, nodeId })
    expect(newState[setName].has(nodeId)).toBe(true)
  })

  it("removes node from set when present", () => {
    const state = createBoardState()
    const toggled = dispatchAll(state, [
      { type: actionType, nodeId },
      { type: actionType, nodeId },
    ])
    expect(toggled[setName].has(nodeId)).toBe(false)
  })

  it("does not mutate original state", () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: actionType, nodeId })
    expect(state[setName].size).toBe(0)
    expect(newState[setName].size).toBe(1)
  })
})

describe("TOGGLE_FOLD action - additional", () => {
  it("handles multiple folded nodes independently", () => {
    const state = createBoardState()
    const result = dispatchAll(state, [
      { type: "TOGGLE_FOLD", nodeId: "node-1" },
      { type: "TOGGLE_FOLD", nodeId: "node-2" },
    ])
    expect(result.foldDepths.has("node-1")).toBe(true)
    expect(result.foldDepths.has("node-2")).toBe(true)
    expect(result.foldDepths.size).toBe(2)
  })
})

describe("TOGGLE_COLLAPSE action - additional", () => {
  it("keeps collapse and fold state separate", () => {
    const state = createBoardState()
    const result = dispatchAll(state, [
      { type: "TOGGLE_FOLD", nodeId: "node-1" },
      { type: "TOGGLE_COLLAPSE", nodeId: "node-1" },
    ])
    expect(result.foldDepths.has("node-1")).toBe(true)
    expect(result.collapsedNodes.has("node-1")).toBe(true)
  })
})

// ===== Zoom =====

describe("ZOOM_IN action", () => {
  it("changes root to specified node", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = dispatch(state, { type: "ZOOM_IN", nodeId: "new-root" })
    expect(newState.rootId).toBe("new-root")
  })

  it("sets cursor to provided cursorNodeId", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = dispatch(state, {
      type: "ZOOM_IN",
      nodeId: "new-root",
      cursorNodeId: "new-cursor",
    })
    expect(newState.cursorNodeId).toBe("new-cursor")
  })

  it("sets cursor to null when cursorNodeId not provided", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = dispatch(state, { type: "ZOOM_IN", nodeId: "new-root" })
    expect(newState.cursorNodeId).toBeNull()
  })

  it("clears sticky cursor on zoom", () => {
    const state = createBoardState()
    const zoomed = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "ZOOM_IN", nodeId: "new-root" },
    ])
    expect(zoomed.curswantX).toBeNull()
    expect(zoomed.curswantY).toBeNull()
  })

  it("allows null node ID for zoom", () => {
    const state = createBoardState("root-1", "/file.md", "cursor-1")
    const newState = dispatch(state, { type: "ZOOM_IN", nodeId: null })
    expect(newState.rootId).toBeNull()
  })
})

// ===== Root Change =====

describe("SET_ROOT action", () => {
  const setRootAction = (rootId: string, rootPath: string, cursorNodeId: string): BoardAction => ({
    type: "SET_ROOT",
    rootId,
    rootPath,
    cursorNodeId,
  })

  it("changes root to new file", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = dispatch(state, setRootAction("root-2", "/file2.md", "cursor-2"))
    expect(newState.rootId).toBe("root-2")
    expect(newState.rootPath).toBe("/file2.md")
    expect(newState.cursorNodeId).toBe("cursor-2")
  })

  it("adds current state to navigation history", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = dispatch(state, setRootAction("root-2", "/file2.md", "cursor-2"))
    expect(newState.navHistory).toHaveLength(1)
    expect(newState.navHistory[0]).toEqual({
      rootId: "root-1",
      rootPath: "/file1.md",
      cursorNodeId: "cursor-1",
    })
  })

  it("increments history index", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const newState = dispatch(state, setRootAction("root-2", "/file2.md", "cursor-2"))
    expect(newState.navHistoryIndex).toBe(1)
  })

  it("truncates history on non-linear navigation", () => {
    const state = createBoardState("root-1", "/file1.md", "cursor-1")
    const state3 = dispatchAll(state, [
      setRootAction("root-2", "/file2.md", "cursor-2"),
      setRootAction("root-3", "/file3.md", "cursor-3"),
    ])

    // Go back in history (simulated by manually setting index)
    const stateBack = { ...state3, navHistoryIndex: 0 }

    // Navigate to new location - should truncate future history
    const stateBranch = dispatch(stateBack, setRootAction("root-branch", "/file-branch.md", "cursor-branch"))

    expect(stateBranch.navHistory).toHaveLength(2)
    expect(stateBranch.navHistory[1]?.rootId).toBe("root-3")
  })

  it("clears sticky cursor on root change", () => {
    const state = createBoardState()
    const changed = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      setRootAction("root-2", "/file2.md", "cursor-2"),
    ])
    expect(changed.curswantX).toBeNull()
    expect(changed.curswantY).toBeNull()
  })
})

// ===== Selection Actions =====

describe("SELECT_NODE_ADD action", () => {
  it("adds node to selection", () => {
    const state = createBoardState()
    const newState = dispatch(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    expect(newState.selectedNodes.has("node-1")).toBe(true)
  })

  it("preserves existing selections", () => {
    const state = createBoardState()
    const result = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
    ])
    expect(result.selectedNodes.has("node-1")).toBe(true)
    expect(result.selectedNodes.has("node-2")).toBe(true)
  })

  it("does not mutate original state", () => {
    const state = createBoardState()
    const newState = dispatch(state, {
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
    const removed = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_REMOVE", nodeId: "node-1" },
    ])
    expect(removed.selectedNodes.has("node-1")).toBe(false)
  })

  it("preserves other selections", () => {
    const state = createBoardState()
    const removed = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
      { type: "SELECT_NODE_REMOVE", nodeId: "node-1" },
    ])
    expect(removed.selectedNodes.has("node-1")).toBe(false)
    expect(removed.selectedNodes.has("node-2")).toBe(true)
  })

  it("does nothing if node not in selection", () => {
    const state = createBoardState()
    const removed = dispatch(state, {
      type: "SELECT_NODE_REMOVE",
      nodeId: "node-1",
    })
    expect(removed.selectedNodes.size).toBe(0)
  })
})

describe("SELECT_NODE_TOGGLE action", () => {
  it("adds node when not selected", () => {
    const state = createBoardState()
    const toggled = dispatch(state, {
      type: "SELECT_NODE_TOGGLE",
      nodeId: "node-1",
    })
    expect(toggled.selectedNodes.has("node-1")).toBe(true)
  })

  it("removes node when already selected", () => {
    const state = createBoardState()
    const toggled = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_TOGGLE", nodeId: "node-1" },
    ])
    expect(toggled.selectedNodes.has("node-1")).toBe(false)
  })

  it("preserves other selections", () => {
    const state = createBoardState()
    const toggled = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
      { type: "SELECT_NODE_TOGGLE", nodeId: "node-1" },
    ])
    expect(toggled.selectedNodes.has("node-1")).toBe(false)
    expect(toggled.selectedNodes.has("node-2")).toBe(true)
  })
})

describe("CLEAR_SELECTION action", () => {
  it("clears all selections", () => {
    const state = createBoardState()
    const cleared = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
      { type: "CLEAR_SELECTION" },
    ])
    expect(cleared.selectedNodes.size).toBe(0)
  })

  it("does nothing when no selections", () => {
    const state = createBoardState()
    const cleared = dispatch(state, { type: "CLEAR_SELECTION" })
    expect(cleared.selectedNodes.size).toBe(0)
  })
})

// ===== Move Mode =====

describe("ENTER_MOVE_MODE action", () => {
  it("enables move mode with node IDs", () => {
    const state = createBoardState()
    const newState = dispatch(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1", "node-2"],
      cursorNodeId: "cursor-1",
    })
    expect(newState.moveState).toEqual({
      active: true,
      sourceNodes: ["node-1", "node-2"],
      sourceCursorNodeId: "cursor-1",
    })
  })

  it("does nothing with empty node array", () => {
    const state = createBoardState()
    const newState = dispatch(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: [],
      cursorNodeId: "cursor-1",
    })
    expect(newState.moveState).toEqual({ active: false })
  })

  it("accepts null cursor node ID", () => {
    const state = createBoardState()
    const newState = dispatch(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds: ["node-1"],
      cursorNodeId: null,
    })
    expect(newState.moveState.active).toBe(true)
    if (newState.moveState.active) {
      expect(newState.moveState.sourceCursorNodeId).toBeNull()
    }
  })
})

describe("CONFIRM_MOVE action", () => {
  const enterMoveMode = (state: BoardState, nodeIds: string[], cursorNodeId: string) =>
    dispatch(state, {
      type: "ENTER_MOVE_MODE",
      nodeIds,
      cursorNodeId,
    })

  it("disables move mode", () => {
    const state = createBoardState()
    const moveMode = enterMoveMode(state, ["node-1"], "cursor-1")
    const confirmed = dispatch(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.moveState).toEqual({ active: false })
  })

  it("clears move source nodes", () => {
    const state = createBoardState()
    const moveMode = enterMoveMode(state, ["node-1", "node-2"], "cursor-1")
    const confirmed = dispatch(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.moveState).toEqual({ active: false })
  })

  it("clears selection after move", () => {
    const state = createBoardState()
    const selected = dispatch(state, {
      type: "SELECT_NODE_ADD",
      nodeId: "node-1",
    })
    const moveMode = enterMoveMode(selected, ["node-1"], "cursor-1")
    const confirmed = dispatch(moveMode, { type: "CONFIRM_MOVE" })
    expect(confirmed.selectedNodes.size).toBe(0)
  })
})

describe("CANCEL_MOVE action", () => {
  it("disables move mode", () => {
    const state = createBoardState()
    const cancelled = dispatchAll(state, [
      {
        type: "ENTER_MOVE_MODE",
        nodeIds: ["node-1"],
        cursorNodeId: "cursor-1",
      },
      { type: "CANCEL_MOVE" },
    ])
    expect(cancelled.moveState).toEqual({ active: false })
  })

  it("restores original cursor position", () => {
    const state = createBoardState("root", "/path", "original-cursor")
    const cancelled = dispatchAll(state, [
      { type: "SELECT", nodeId: "new-cursor" },
      {
        type: "ENTER_MOVE_MODE",
        nodeIds: ["node-1"],
        cursorNodeId: "original-cursor",
      },
      { type: "CANCEL_MOVE" },
    ])
    expect(cancelled.cursorNodeId).toBe("original-cursor")
  })

  it("keeps current cursor if no source cursor", () => {
    const state = createBoardState("root", "/path", "current-cursor")
    const cancelled = dispatchAll(state, [
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-1"], cursorNodeId: null },
      { type: "CANCEL_MOVE" },
    ])
    expect(cancelled.cursorNodeId).toBe("current-cursor")
  })

  it("clears sticky cursor", () => {
    const state = createBoardState()
    const cancelled = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-1"], cursorNodeId: null },
      { type: "CANCEL_MOVE" },
    ])
    expect(cancelled.curswantX).toBeNull()
    expect(cancelled.curswantY).toBeNull()
  })
})

// ===== View Configuration =====

describe.each([
  {
    increaseType: "INCREASE_CONTENT_LINES" as const,
    decreaseType: "DECREASE_CONTENT_LINES" as const,
    field: "maxContentLines" as const,
    defaultValue: 2,
    max: 10,
    min: 0,
  },
])("$field view configuration", ({ increaseType, decreaseType, field, defaultValue, max, min }) => {
  it(`increases ${field} by 1`, () => {
    const state = createBoardState()
    // Start from a value below max to test increase
    const initialState = {
      ...state,
      [field]: Math.min(defaultValue, max - 1),
    }
    const newState = dispatch(initialState, { type: increaseType })
    expect(newState[field]).toBe(initialState[field] + 1)
  })

  it(`does not exceed maximum of ${max}`, () => {
    const state = createBoardState()
    const maxState = { ...state, [field]: max }
    const newState = dispatch(maxState, { type: increaseType })
    expect(newState[field]).toBe(max)
  })

  it(`decreases ${field} by 1`, () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: decreaseType })
    expect(newState[field]).toBe(defaultValue - 1)
  })

  it(`does not go below ${min}`, () => {
    const state = createBoardState()
    const minState = { ...state, [field]: min }
    const newState = dispatch(minState, { type: decreaseType })
    expect(newState[field]).toBe(min)
  })
})

// ===== Sticky Cursor (curswant) =====

describe("SET_CURSWANT action", () => {
  it("sets both x and y coordinates", () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: "SET_CURSWANT", x: 5, y: 10 })
    expect(newState.curswantX).toBe(5)
    expect(newState.curswantY).toBe(10)
  })

  it("sets only x coordinate when y not provided", () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: "SET_CURSWANT", x: 5 })
    expect(newState.curswantX).toBe(5)
    expect(newState.curswantY).toBeNull()
  })

  it("sets only y coordinate when x not provided", () => {
    const state = createBoardState()
    const newState = dispatch(state, { type: "SET_CURSWANT", y: 10 })
    expect(newState.curswantX).toBeNull()
    expect(newState.curswantY).toBe(10)
  })

  it("preserves existing x when setting only y", () => {
    const state = createBoardState()
    const withY = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5 },
      { type: "SET_CURSWANT", y: 10 },
    ])
    expect(withY.curswantX).toBe(5)
    expect(withY.curswantY).toBe(10)
  })

  it("preserves existing y when setting only x", () => {
    const state = createBoardState()
    const withX = dispatchAll(state, [
      { type: "SET_CURSWANT", y: 10 },
      { type: "SET_CURSWANT", x: 5 },
    ])
    expect(withX.curswantX).toBe(5)
    expect(withX.curswantY).toBe(10)
  })

  it("allows setting to null explicitly", () => {
    const state = createBoardState()
    const cleared = dispatchAll(state, [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "SET_CURSWANT", x: null, y: null },
    ])
    expect(cleared.curswantX).toBeNull()
    expect(cleared.curswantY).toBeNull()
  })
})

// ===== Error Handling =====

describe("Error handling", () => {
  it("throws on unhandled action type", () => {
    const state = createBoardState()
    const invalidAction = { type: "INVALID_ACTION" } as unknown as BoardAction
    expect(() => dispatch(state, invalidAction)).toThrow(/Unhandled action: INVALID_ACTION/)
  })
})

// ===== Edge Cases =====

describe("Edge cases", () => {
  it("handles rapid state transitions", () => {
    const state = createBoardState()

    // Rapid sequence of operations
    const actions: BoardAction[] = Array.from({ length: 100 }, (_, i) => ({
      type: "SELECT",
      nodeId: `node-${i}`,
    }))
    const current = dispatchAll(state, actions)

    expect(current.cursorNodeId).toBe("node-99")
  })

  it("handles complex state combinations", () => {
    const state = createBoardState("root", "/file.md", "cursor")

    const complex = dispatchAll(state, [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
      { type: "TOGGLE_FOLD", nodeId: "node-1" },
      { type: "TOGGLE_COLLAPSE", nodeId: "col-1" },
      { type: "SET_CURSWANT", x: 5, y: 10 },
    ])

    expect(complex.selectedNodes.size).toBe(2)
    expect(complex.foldDepths.size).toBe(1)
    expect(complex.collapsedNodes.size).toBe(1)
    expect(complex.curswantX).toBe(5)
    expect(complex.curswantY).toBe(10)
  })

  it("maintains immutability across all operations", () => {
    const state = createBoardState()

    // Save reference to original state
    const original = state

    // Perform various operations (results discarded)
    dispatch(state, { type: "SELECT", nodeId: "node-1" })
    dispatch(state, { type: "TOGGLE_FOLD", nodeId: "node-1" })
    dispatch(state, { type: "SELECT_NODE_ADD", nodeId: "node-1" })

    // Original state should be unchanged
    expect(original.cursorNodeId).toBeNull()
    expect(original.foldDepths.size).toBe(0)
    expect(original.selectedNodes.size).toBe(0)
  })

  it("handles empty board state transitions", () => {
    const state = createBoardState()

    // Operations on empty state should work
    const selected = dispatch(state, { type: "SELECT", nodeId: null })
    expect(selected.cursorNodeId).toBeNull()

    const cleared = dispatch(state, { type: "CLEAR_SELECTION" })
    expect(cleared.selectedNodes.size).toBe(0)

    const cancelled = dispatch(state, { type: "CANCEL_MOVE" })
    expect(cancelled.moveState).toEqual({ active: false })
  })
})

// ===== Integration Scenarios =====

describe("Integration scenarios", () => {
  it("typical navigation flow", () => {
    const state = dispatchAll(createBoardState("root-1", "/file1.md", null), [
      { type: "SELECT", nodeId: "node-1" },
      { type: "TOGGLE_FOLD", nodeId: "node-1" },
      { type: "ZOOM_IN", nodeId: "node-2", cursorNodeId: "node-2-child" },
    ])

    expect(state.foldDepths.has("node-1")).toBe(true)
    expect(state.rootId).toBe("node-2")
    expect(state.cursorNodeId).toBe("node-2-child")
  })

  it("multi-select and move workflow", () => {
    const state = dispatchAll(createBoardState("root", "/file.md", "cursor-1"), [
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-2" },
      { type: "SELECT_NODE_ADD", nodeId: "node-3" },
      {
        type: "ENTER_MOVE_MODE",
        nodeIds: ["node-1", "node-2", "node-3"],
        cursorNodeId: "cursor-1",
      },
      { type: "SELECT", nodeId: "destination" },
      { type: "CONFIRM_MOVE" },
    ])

    expect(state.moveState).toEqual({ active: false })
    expect(state.selectedNodes.size).toBe(0)
  })

  it("navigation history flow", () => {
    const state = dispatchAll(createBoardState("root-1", "/file1.md", "cursor-1"), [
      {
        type: "SET_ROOT",
        rootId: "root-2",
        rootPath: "/file2.md",
        cursorNodeId: "cursor-2",
      },
      {
        type: "SET_ROOT",
        rootId: "root-3",
        rootPath: "/file3.md",
        cursorNodeId: "cursor-3",
      },
    ])

    expect(state.navHistory).toHaveLength(2)
    expect(state.navHistoryIndex).toBe(2)
    expect(state.navHistory[0]?.rootId).toBe("root-1")
    expect(state.navHistory[1]?.rootId).toBe("root-2")
  })

  it("view configuration adjustment", () => {
    const state = dispatchAll(createBoardState(), [
      { type: "INCREASE_CONTENT_LINES" },
      { type: "INCREASE_CONTENT_LINES" },
      { type: "DECREASE_CONTENT_LINES" },
    ])

    expect(state.maxContentLines).toBe(3)
  })

  it("sticky cursor across navigation", () => {
    const state = dispatchAll(createBoardState("root", "/file.md", "cursor-1"), [
      { type: "SET_CURSWANT", x: 2, y: 5 },
      { type: "SET_CURSWANT", y: 6 },
    ])

    expect(state.curswantX).toBe(2)
    expect(state.curswantY).toBe(6)

    // Explicit selection clears sticky cursor
    const afterSelect = dispatch(state, {
      type: "SELECT",
      nodeId: "new-cursor",
    })
    expect(afterSelect.curswantX).toBeNull()
    expect(afterSelect.curswantY).toBeNull()
  })
})
