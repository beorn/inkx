/**
 * Board State Reducer
 *
 * ID-based reducer for board navigation.
 * No tree traversal - just updates IDs and Sets.
 * Navigation handlers compute target nodeIds using Repo.
 *
 * See hazy-forging-crayon.md plan for design rationale.
 */

import { createLogger } from "loggily"
import type { BoardState, BoardReducerOp } from "./board-types.ts"

const log = createLogger("km:board:reducer")

// ===== Reducer =====

/**
 * Pure reducer for board state transitions.
 * Handles cursor selection, fold/collapse, zoom, move mode.
 *
 * IMPORTANT: No tree traversal here - navigation handlers use Repo.
 */
export function simplifiedBoardReducer(state: BoardState, action: BoardReducerOp): BoardState {
  log.debug?.(`action: ${action.type}`)

  switch (action.type) {
    // ===== Cursor Selection =====

    case "SELECT": {
      // Navigation handler computed the target nodeId
      // Cursor is now managed by sel.node.select() — just clear curswant.
      return {
        ...state,
        curswantX: null, // Clear curswant on explicit selection
        curswantY: null,
      }
    }

    // ===== Fold/Collapse =====

    case "TOGGLE_FOLD": {
      const newDepths = new Map(state.foldDepths)
      if (newDepths.has(action.nodeId)) {
        newDepths.delete(action.nodeId)
      } else {
        newDepths.set(action.nodeId, 0)
      }
      return { ...state, foldDepths: newDepths }
    }

    case "TOGGLE_COLLAPSE": {
      const newCollapsed = new Set(state.collapsedNodes)
      if (newCollapsed.has(action.nodeId)) {
        newCollapsed.delete(action.nodeId)
      } else {
        newCollapsed.add(action.nodeId)
      }
      return { ...state, collapsedNodes: newCollapsed }
    }

    case "SET_COLLAPSED_NODES": {
      return { ...state, collapsedNodes: new Set(action.nodeIds) }
    }

    // ===== Zoom =====

    case "ZOOM_IN": {
      // Zoom is now just a root change - no stack needed
      // Parent can be derived from tree via parent_id
      // Cursor is managed by sel.node.select() at the call site.
      return {
        ...state,
        rootId: action.nodeId,
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== Root Change =====

    case "SET_ROOT": {
      // Navigate to a different file/root
      // Cursor is managed by sel.node.select() at the call site.
      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== Move Mode =====

    case "ENTER_MOVE_MODE": {
      if (action.nodeIds.length === 0) return state

      return {
        ...state,
        moveState: {
          active: true,
          sourceNodes: action.nodeIds,
          sourceCursor: null, // Caller manages cursor via sel.node.select()
        },
      }
    }

    case "CONFIRM_MOVE": {
      return {
        ...state,
        moveState: { active: false },
      }
    }

    case "CANCEL_MOVE": {
      // Cursor restore is handled by the caller via sel.node.select()
      return {
        ...state,
        moveState: { active: false },
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== Sticky Cursor =====

    case "SET_CURSWANT": {
      return {
        ...state,
        curswantX: action.x !== undefined ? action.x : state.curswantX,
        curswantY: action.y !== undefined ? action.y : state.curswantY,
      }
    }

    default: {
      const unhandled = action as { type: string }
      throw new Error(`[km:board] Unhandled action: ${unhandled.type}`)
    }
  }
}

/**
 * Create initial board state
 */
export function createBoardState(
  rootId: string | null = null,
  rootPath: string | null = null,
  collapsedNodeIds?: Set<string>,
): BoardState {
  return {
    rootId,
    rootPath,
    foldDepths: new Map(),
    collapsedNodes: collapsedNodeIds ?? new Set(),
    navHistory: [],
    navHistoryIndex: 0,
    moveState: { active: false },
    curswantX: null,
    curswantY: null,
  }
}
