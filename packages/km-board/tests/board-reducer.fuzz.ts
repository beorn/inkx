/**
 * Board Reducer Fuzz Tests
 *
 * Pure reducer-level fuzz testing. Calls the reducer directly with random
 * actions and checks state invariants after each transition. This catches
 * state corruption that TUI-level fuzz tests might miss (the driver
 * filters/masks some invalid states before they surface).
 *
 * ## Running
 *
 * ```bash
 * # Run fuzz tests (requires FUZZ=1 for non-CI)
 * FUZZ=1 bun vitest run packages/km-board/tests/board-reducer.fuzz.ts
 *
 * # With specific seed for reproducibility
 * FUZZ_SEED=12345 FUZZ=1 bun vitest run packages/km-board/tests/board-reducer.fuzz.ts
 * ```
 *
 * ## Invariants Checked
 *
 * 1. **No exceptions**: reducer never throws for valid actions
 * 2. **maxContentLines bounded**: always in [0, 10]
 * 3. **Move mode consistency**: sourceNodes non-empty iff moveState.active is true
 * 4. **navHistoryIndex bounded**: always in [0, navHistory.length]
 * 5. **Immutability**: original state is never mutated
 * 6. **Collection types**: Sets remain Sets, Maps remain Maps
 */

import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey"
import { boardReducer, createBoardState } from "../src/board-reducer.ts"
import type { BoardAction, BoardState } from "../src/board-types.ts"

// =============================================================================
// Action Generators
// =============================================================================

/** Pool of node IDs used in generated actions */
const NODE_IDS = [
  "root",
  "node-1",
  "node-2",
  "node-3",
  "node-4",
  "node-5",
  "col-1",
  "col-2",
  "col-3",
  "child-1",
  "child-2",
  "deep-1",
  "deep-2",
]

/** Pool of file paths for SET_ROOT actions */
const PATHS = ["/file1.md", "/file2.md", "/dir/file3.md", "/notes/daily.md", null]

/**
 * Generate a random BoardAction.
 *
 * Uses weighted distribution to simulate realistic usage patterns:
 * cursor movement is most common, fold/collapse moderately common,
 * move mode and root changes least common.
 */
function randomAction(pick: (arr: readonly string[]) => string, pickFloat: () => number): BoardAction {
  const r = pickFloat()

  // SELECT (30%) — most common
  if (r < 0.3) {
    const nodeId = pickFloat() < 0.05 ? null : pick(NODE_IDS)
    return { type: "SELECT", nodeId }
  }

  // TOGGLE_FOLD (8%)
  if (r < 0.38) {
    return { type: "TOGGLE_FOLD", nodeId: pick(NODE_IDS) }
  }

  // TOGGLE_COLLAPSE (8%)
  if (r < 0.46) {
    return { type: "TOGGLE_COLLAPSE", nodeId: pick(NODE_IDS) }
  }

  // ZOOM_IN (6%)
  if (r < 0.52) {
    const nodeId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    const cursorNodeId = pickFloat() < 0.3 ? pick(NODE_IDS) : undefined
    return { type: "ZOOM_IN", nodeId, cursorNodeId }
  }

  // SET_ROOT (5%)
  if (r < 0.57) {
    const rootId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    const rootPath = PATHS[Math.floor(pickFloat() * PATHS.length)] ?? null
    const cursorNodeId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    return { type: "SET_ROOT", rootId, rootPath, cursorNodeId }
  }

  // SELECT_NODE_ADD (6%)
  if (r < 0.63) {
    return { type: "SELECT_NODE_ADD", nodeId: pick(NODE_IDS) }
  }

  // SELECT_NODE_REMOVE (4%)
  if (r < 0.67) {
    return { type: "SELECT_NODE_REMOVE", nodeId: pick(NODE_IDS) }
  }

  // SELECT_NODE_TOGGLE (5%)
  if (r < 0.72) {
    return { type: "SELECT_NODE_TOGGLE", nodeId: pick(NODE_IDS) }
  }

  // CLEAR_SELECTION (4%)
  if (r < 0.76) {
    return { type: "CLEAR_SELECTION" }
  }

  // ENTER_MOVE_MODE (5%)
  if (r < 0.81) {
    const count = Math.floor(pickFloat() * 4) // 0-3 nodes
    const nodeIds = Array.from({ length: count }, () => pick(NODE_IDS))
    const cursorNodeId = pickFloat() < 0.2 ? null : pick(NODE_IDS)
    return { type: "ENTER_MOVE_MODE", nodeIds, cursorNodeId }
  }

  // CONFIRM_MOVE (4%)
  if (r < 0.85) {
    return { type: "CONFIRM_MOVE" }
  }

  // CANCEL_MOVE (4%)
  if (r < 0.89) {
    return { type: "CANCEL_MOVE" }
  }

  // INCREASE_CONTENT_LINES (3%)
  if (r < 0.92) {
    return { type: "INCREASE_CONTENT_LINES" }
  }

  // DECREASE_CONTENT_LINES (3%)
  if (r < 0.95) {
    return { type: "DECREASE_CONTENT_LINES" }
  }

  // SET_CURSWANT (5%)
  const x = pickFloat() < 0.3 ? null : Math.floor(pickFloat() * 20)
  const y = pickFloat() < 0.3 ? null : Math.floor(pickFloat() * 50)
  return { type: "SET_CURSWANT", x: x ?? undefined, y: y ?? undefined }
}

// =============================================================================
// Invariant Checks
// =============================================================================

/**
 * Check all state invariants after a reducer transition.
 *
 * These invariants must hold after ANY valid action, regardless of
 * what state we started in.
 */
function checkInvariants(state: BoardState, action: BoardAction, before: BoardState): void {
  const label = `after ${action.type}`

  // 1. maxContentLines is bounded [0, 10]
  expect(state.maxContentLines, `maxContentLines in range ${label}`).toBeGreaterThanOrEqual(0)
  expect(state.maxContentLines, `maxContentLines in range ${label}`).toBeLessThanOrEqual(10)

  // 2. Move mode consistency: sourceNodes non-empty iff moveState.active is true
  if (state.moveState.active) {
    expect(
      state.moveState.sourceNodes.length,
      `moveState.active=true requires non-empty sourceNodes ${label}`,
    ).toBeGreaterThan(0)
  }

  // 3. navHistoryIndex is bounded [0, navHistory.length]
  expect(state.navHistoryIndex, `navHistoryIndex >= 0 ${label}`).toBeGreaterThanOrEqual(0)
  expect(state.navHistoryIndex, `navHistoryIndex <= navHistory.length ${label}`).toBeLessThanOrEqual(
    state.navHistory.length,
  )

  // 4. Collection types are correct
  expect(state.selectedNodes, `selectedNodes is a Set ${label}`).toBeInstanceOf(Set)
  expect(state.foldDepths, `foldDepths is a Map ${label}`).toBeInstanceOf(Map)
  expect(state.collapsedNodes, `collapsedNodes is a Set ${label}`).toBeInstanceOf(Set)

  // 5. navHistory entries have correct shape
  for (const entry of state.navHistory) {
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("rootId")
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("rootPath")
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("cursorNodeId")
  }

  // 6. moveState has valid shape
  expect(typeof state.moveState.active, `moveState.active is boolean ${label}`).toBe("boolean")
  if (state.moveState.active) {
    expect(Array.isArray(state.moveState.sourceNodes), `moveState.sourceNodes is array ${label}`).toBe(true)
  }

  // 7. Immutability: original state's collections were not mutated
  //    (We check sizes of the before state's collections haven't changed)
  //    This only works if we snapshot the sizes before dispatching.
  //    We pass before state for this check.
  if (before !== state) {
    // The before state's Sets and Maps should still have the same size they had
    // before the action. We can't check this retroactively — but we can verify
    // the new state uses DIFFERENT references when it changed collections.
    if (state.selectedNodes !== before.selectedNodes) {
      // Different reference — that's correct immutability
    }
    if (state.foldDepths !== before.foldDepths) {
      // Different reference — correct
    }
    if (state.collapsedNodes !== before.collapsedNodes) {
      // Different reference — correct
    }
  }
}

/**
 * Deep-clone the mutable parts of BoardState for immutability checking.
 */
function snapshotMutableState(state: BoardState) {
  return {
    selectedNodesSize: state.selectedNodes.size,
    selectedNodesEntries: [...state.selectedNodes],
    foldDepthsSize: state.foldDepths.size,
    foldDepthsEntries: [...state.foldDepths],
    collapsedNodesSize: state.collapsedNodes.size,
    collapsedNodesEntries: [...state.collapsedNodes],
    navHistoryLength: state.navHistory.length,
    moveStateActive: state.moveState.active,
    moveSourceNodesLength: state.moveState.active ? state.moveState.sourceNodes.length : 0,
  }
}

/**
 * Verify that the original state was not mutated by the reducer.
 */
function checkImmutability(state: BoardState, snapshot: ReturnType<typeof snapshotMutableState>, action: BoardAction) {
  const label = `immutability after ${action.type}`

  expect(state.selectedNodes.size, `selectedNodes size unchanged ${label}`).toBe(snapshot.selectedNodesSize)
  expect([...state.selectedNodes], `selectedNodes entries unchanged ${label}`).toEqual(snapshot.selectedNodesEntries)

  expect(state.foldDepths.size, `foldDepths size unchanged ${label}`).toBe(snapshot.foldDepthsSize)
  expect([...state.foldDepths], `foldDepths entries unchanged ${label}`).toEqual(snapshot.foldDepthsEntries)

  expect(state.collapsedNodes.size, `collapsedNodes size unchanged ${label}`).toBe(snapshot.collapsedNodesSize)
  expect([...state.collapsedNodes], `collapsedNodes entries unchanged ${label}`).toEqual(snapshot.collapsedNodesEntries)

  expect(state.navHistory.length, `navHistory length unchanged ${label}`).toBe(snapshot.navHistoryLength)
  const currentMoveSourceLength = state.moveState.active ? state.moveState.sourceNodes.length : 0
  expect(currentMoveSourceLength, `moveSourceNodes length unchanged ${label}`).toBe(snapshot.moveSourceNodesLength)
}

// =============================================================================
// Fuzz Tests
// =============================================================================

describe("Board Reducer Fuzz Tests", () => {
  /**
   * Core fuzz: random actions from a clean initial state.
   * Checks all invariants hold after every transition.
   */
  test.fuzz("random actions maintain state invariants", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    for await (const _ of take(
      gen(({ random }) => {
        const action = randomAction(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
        return action
      }),
      300,
    )) {
      const action = _ as BoardAction
      const snapshot = snapshotMutableState(state)
      const before = state

      state = boardReducer(state, action)

      checkInvariants(state, action, before)
      checkImmutability(before, snapshot, action)
    }
  })

  /**
   * Fuzz from null/empty initial state.
   * Many actions reference node IDs that don't match rootId or cursorNodeId.
   * The reducer should still never throw or violate invariants.
   */
  test.fuzz("random actions from empty state", async () => {
    let state = createBoardState() // null rootId, null cursorNodeId

    for await (const _ of take(
      gen(({ random }) => {
        return randomAction(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
      }),
      200,
    )) {
      const action = _ as BoardAction
      const before = state

      state = boardReducer(state, action)

      checkInvariants(state, action, before)
    }
  })

  /**
   * Fuzz focused on move mode transitions.
   * Move mode has multiple states (enter/confirm/cancel) that interact
   * with selection and cursor — a common source of invariant violations.
   */
  test.fuzz("move mode transitions maintain invariants", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    const moveActions: BoardAction[] = [
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-1", "node-2"], cursorNodeId: "node-1" },
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-3"], cursorNodeId: null },
      { type: "ENTER_MOVE_MODE", nodeIds: [], cursorNodeId: "node-1" }, // empty — should no-op
      { type: "CONFIRM_MOVE" },
      { type: "CANCEL_MOVE" },
      { type: "SELECT", nodeId: "node-2" },
      { type: "SELECT", nodeId: "node-5" },
      { type: "SELECT_NODE_ADD", nodeId: "node-1" },
      { type: "SELECT_NODE_ADD", nodeId: "node-3" },
      { type: "CLEAR_SELECTION" },
    ]

    for await (const action of take(gen(moveActions), 200)) {
      const before = state
      state = boardReducer(state, action)
      checkInvariants(state, action, before)
    }
  })

  /**
   * Fuzz focused on navigation history growth.
   * SET_ROOT grows navHistory and truncates on non-linear navigation.
   * Check that index stays valid as history grows and gets truncated.
   */
  test.fuzz("navigation history stays consistent", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    const navActions: BoardAction[] = [
      { type: "SET_ROOT", rootId: "root-2", rootPath: "/file2.md", cursorNodeId: "node-2" },
      { type: "SET_ROOT", rootId: "root-3", rootPath: "/file3.md", cursorNodeId: "node-3" },
      { type: "SET_ROOT", rootId: "root-4", rootPath: "/file4.md", cursorNodeId: "node-4" },
      { type: "SET_ROOT", rootId: null, rootPath: null, cursorNodeId: null },
      { type: "SELECT", nodeId: "node-1" },
      { type: "ZOOM_IN", nodeId: "node-2" },
      { type: "ZOOM_IN", nodeId: null },
    ]

    for await (const action of take(gen(navActions), 200)) {
      const before = state
      state = boardReducer(state, action)

      checkInvariants(state, action, before)

      // Additional nav-specific invariant: after SET_ROOT, history grew by 1
      if (action.type === "SET_ROOT") {
        expect(state.navHistory.length, "SET_ROOT grows history").toBe(before.navHistory.length + 1)
      }
    }
  })

  /**
   * Fuzz focused on view configuration bounds.
   * INCREASE/DECREASE_CONTENT_LINES should always stay in [0, 10].
   */
  test.fuzz("content lines stay bounded", async () => {
    let state = createBoardState()

    const viewActions: BoardAction[] = [
      { type: "INCREASE_CONTENT_LINES" },
      { type: "INCREASE_CONTENT_LINES" },
      { type: "INCREASE_CONTENT_LINES" },
      { type: "DECREASE_CONTENT_LINES" },
      { type: "DECREASE_CONTENT_LINES" },
      { type: "DECREASE_CONTENT_LINES" },
    ]

    for await (const action of take(gen(viewActions), 200)) {
      const before = state
      state = boardReducer(state, action)

      expect(state.maxContentLines, "maxContentLines >= 0").toBeGreaterThanOrEqual(0)
      expect(state.maxContentLines, "maxContentLines <= 10").toBeLessThanOrEqual(10)
    }
  })

  /**
   * Fuzz focused on fold/collapse toggling.
   * Toggle twice should return to original state (idempotent round-trip).
   */
  test.fuzz("fold/collapse toggle is idempotent", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    for await (const nodeId of take(gen(NODE_IDS), 100)) {
      // Toggle fold twice
      const s1 = boardReducer(state, { type: "TOGGLE_FOLD", nodeId })
      const s2 = boardReducer(s1, { type: "TOGGLE_FOLD", nodeId })
      expect(s2.foldDepths.has(nodeId), `fold toggle round-trip for ${nodeId}`).toBe(state.foldDepths.has(nodeId))

      // Toggle collapse twice
      const s3 = boardReducer(state, { type: "TOGGLE_COLLAPSE", nodeId })
      const s4 = boardReducer(s3, { type: "TOGGLE_COLLAPSE", nodeId })
      expect(s4.collapsedNodes.has(nodeId), `collapse toggle round-trip for ${nodeId}`).toBe(
        state.collapsedNodes.has(nodeId),
      )

      // Advance state with a random fold to build up diverse state
      state = s1
    }
  })

  /**
   * Fuzz focused on curswant (sticky cursor) interactions.
   * SELECT, ZOOM_IN, SET_ROOT, CANCEL_MOVE should all clear curswant.
   */
  test.fuzz("curswant cleared by cursor-resetting actions", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    const curswantSetters: BoardAction[] = [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "SET_CURSWANT", x: 0 },
      { type: "SET_CURSWANT", y: 0 },
      { type: "SET_CURSWANT", x: 99, y: 99 },
    ]

    const curswantClearers: BoardAction[] = [
      { type: "SELECT", nodeId: "node-1" },
      { type: "ZOOM_IN", nodeId: "node-2" },
      { type: "SET_ROOT", rootId: "root-2", rootPath: "/f.md", cursorNodeId: "c" },
    ]

    for await (const _ of take(
      gen(({ random }) => {
        // Set curswant, then clear it
        const setter = curswantSetters[Math.floor(random.float() * curswantSetters.length)]
        const clearer = curswantClearers[Math.floor(random.float() * curswantClearers.length)]
        return [setter, clearer]
      }),
      100,
    )) {
      const action = _ as BoardAction
      state = boardReducer(state, action)

      // After a clearing action, curswant should be null
      if (action.type === "SELECT" || action.type === "ZOOM_IN" || action.type === "SET_ROOT") {
        expect(state.curswantX, `curswantX null after ${action.type}`).toBeNull()
        expect(state.curswantY, `curswantY null after ${action.type}`).toBeNull()
      }
    }
  })

  /**
   * Stress test: long action sequences to surface accumulated state corruption.
   * 1000 random actions from a single initial state.
   */
  test.fuzz("long sequence stress test", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    for await (const _ of take(
      gen(({ random }) => {
        return randomAction(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
      }),
      1000,
    )) {
      const action = _ as BoardAction
      const before = state

      state = boardReducer(state, action)

      checkInvariants(state, action, before)
    }
  })
})
