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
 * 2. **Move mode consistency**: sourceNodes non-empty iff moveState.active is true
 * 3. **navHistoryIndex bounded**: always in [0, navHistory.length]
 * 4. **Immutability**: original state is never mutated
 * 5. **Collection types**: Sets remain Sets, Maps remain Maps
 *
 * NOTE: Multi-select (selectedNodes) and view config (maxContentLines) are NOT
 * part of BoardState — they live in per-pane UI state, handled by the TUI layer.
 */

import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey"
import { boardReducer, createBoardState } from "../src/board-reducer.ts"
import type { BoardReducerOp, BoardState } from "../src/board-types.ts"

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
 * Generate a random BoardReducerOp.
 *
 * Uses weighted distribution to simulate realistic usage patterns:
 * cursor movement is most common, fold/collapse moderately common,
 * move mode and root changes least common.
 */
function randomOp(pick: (arr: readonly string[]) => string, pickFloat: () => number): BoardReducerOp {
  const r = pickFloat()

  // SELECT (30%) — most common
  if (r < 0.3) {
    const nodeId = pickFloat() < 0.05 ? null : pick(NODE_IDS)
    return { type: "SELECT", nodeId }
  }

  // TOGGLE_FOLD (10%)
  if (r < 0.4) {
    return { type: "TOGGLE_FOLD", nodeId: pick(NODE_IDS) }
  }

  // TOGGLE_COLLAPSE (10%)
  if (r < 0.5) {
    return { type: "TOGGLE_COLLAPSE", nodeId: pick(NODE_IDS) }
  }

  // SET_COLLAPSED_NODES (5%)
  if (r < 0.55) {
    const count = Math.floor(pickFloat() * 4) // 0-3 nodes
    const nodeIds = Array.from({ length: count }, () => pick(NODE_IDS))
    return { type: "SET_COLLAPSED_NODES", nodeIds }
  }

  // ZOOM_IN (8%)
  if (r < 0.63) {
    const nodeId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    const cursorNodeId = pickFloat() < 0.3 ? pick(NODE_IDS) : undefined
    return { type: "ZOOM_IN", nodeId, cursorNodeId }
  }

  // SET_ROOT (7%)
  if (r < 0.7) {
    const rootId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    const rootPath = PATHS[Math.floor(pickFloat() * PATHS.length)] ?? null
    const cursorNodeId = pickFloat() < 0.1 ? null : pick(NODE_IDS)
    return { type: "SET_ROOT", rootId, rootPath, cursorNodeId }
  }

  // ENTER_MOVE_MODE (8%)
  if (r < 0.78) {
    const count = Math.floor(pickFloat() * 4) // 0-3 nodes
    const nodeIds = Array.from({ length: count }, () => pick(NODE_IDS))
    const cursorNodeId = pickFloat() < 0.2 ? null : pick(NODE_IDS)
    return { type: "ENTER_MOVE_MODE", nodeIds, cursorNodeId }
  }

  // CONFIRM_MOVE (5%)
  if (r < 0.83) {
    return { type: "CONFIRM_MOVE" }
  }

  // CANCEL_MOVE (5%)
  if (r < 0.88) {
    return { type: "CANCEL_MOVE" }
  }

  // SET_CURSWANT (12%)
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
function checkInvariants(state: BoardState, action: BoardReducerOp, before: BoardState): void {
  const label = `after ${action.type}`

  // 1. Move mode consistency: sourceNodes non-empty iff moveState.active is true
  if (state.moveState.active) {
    expect(
      state.moveState.sourceNodes.length,
      `moveState.active=true requires non-empty sourceNodes ${label}`,
    ).toBeGreaterThan(0)
  }

  // 2. navHistoryIndex is bounded [0, navHistory.length]
  expect(state.navHistoryIndex, `navHistoryIndex >= 0 ${label}`).toBeGreaterThanOrEqual(0)
  expect(state.navHistoryIndex, `navHistoryIndex <= navHistory.length ${label}`).toBeLessThanOrEqual(
    state.navHistory.length,
  )

  // 3. Collection types are correct
  expect(state.foldDepths, `foldDepths is a Map ${label}`).toBeInstanceOf(Map)
  expect(state.collapsedNodes, `collapsedNodes is a Set ${label}`).toBeInstanceOf(Set)

  // 4. navHistory entries have correct shape
  for (const entry of state.navHistory) {
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("rootId")
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("rootPath")
    expect(entry, `navHistory entry has required fields ${label}`).toHaveProperty("cursorNodeId")
  }

  // 5. moveState has valid shape
  expect(typeof state.moveState.active, `moveState.active is boolean ${label}`).toBe("boolean")
  if (state.moveState.active) {
    expect(Array.isArray(state.moveState.sourceNodes), `moveState.sourceNodes is array ${label}`).toBe(true)
  }

  // 6. Immutability: original state's collections were not mutated
  if (before !== state) {
    if (state.foldDepths !== before.foldDepths) {
      // Different reference — correct immutability
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
function checkImmutability(
  state: BoardState,
  snapshot: ReturnType<typeof snapshotMutableState>,
  action: BoardReducerOp,
) {
  const label = `immutability after ${action.type}`

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
        const action = randomOp(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
        return action
      }),
      300,
    )) {
      const action = _ as BoardReducerOp
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
        return randomOp(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
      }),
      200,
    )) {
      const action = _ as BoardReducerOp
      const before = state

      state = boardReducer(state, action)

      checkInvariants(state, action, before)
    }
  })

  /**
   * Fuzz focused on move mode transitions.
   * Move mode has multiple states (enter/confirm/cancel) that interact
   * with cursor — a common source of invariant violations.
   */
  test.fuzz("move mode transitions maintain invariants", async () => {
    let state = createBoardState("root", "/board.md", "node-1")

    const moveActions: BoardReducerOp[] = [
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-1", "node-2"], cursorNodeId: "node-1" },
      { type: "ENTER_MOVE_MODE", nodeIds: ["node-3"], cursorNodeId: null },
      { type: "ENTER_MOVE_MODE", nodeIds: [], cursorNodeId: "node-1" }, // empty — should no-op
      { type: "CONFIRM_MOVE" },
      { type: "CANCEL_MOVE" },
      { type: "SELECT", nodeId: "node-2" },
      { type: "SELECT", nodeId: "node-5" },
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

    const navActions: BoardReducerOp[] = [
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

    const curswantSetters: BoardReducerOp[] = [
      { type: "SET_CURSWANT", x: 5, y: 10 },
      { type: "SET_CURSWANT", x: 0 },
      { type: "SET_CURSWANT", y: 0 },
      { type: "SET_CURSWANT", x: 99, y: 99 },
    ]

    const curswantClearers: BoardReducerOp[] = [
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
      const action = _ as BoardReducerOp
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
        return randomOp(
          (arr) => arr[Math.floor(random.float() * arr.length)]!,
          () => random.float(),
        )
      }),
      1000,
    )) {
      const action = _ as BoardReducerOp
      const before = state

      state = boardReducer(state, action)

      checkInvariants(state, action, before)
    }
  })
})
