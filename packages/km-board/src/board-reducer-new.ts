/**
 * Board State Reducer
 *
 * ID-based reducer for board navigation.
 * No tree traversal - just updates IDs and Sets.
 * Navigation handlers compute target nodeIds using Repo.
 *
 * See hazy-forging-crayon.md plan for design rationale.
 */

import { createConditionalLogger } from "@beorn/logger"
import type { BoardState, BoardAction } from "./board-types.ts"

const log = createConditionalLogger("km:board:reducer")

// ===== Reducer =====

/**
 * Pure reducer for board state transitions.
 * Handles cursor selection, fold/collapse, zoom, move mode.
 *
 * IMPORTANT: No tree traversal here - navigation handlers use Repo.
 */
export function simplifiedBoardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  log.debug?.(`action: ${action.type}`)

  switch (action.type) {
    // ===== Cursor Selection =====

    case "SELECT": {
      // Navigation handler computed the target nodeId
      return {
        ...state,
        cursorNodeId: action.nodeId,
        curswantX: null, // Clear curswant on explicit selection
        curswantY: null,
      }
    }

    // ===== Fold/Collapse =====

    case "TOGGLE_FOLD": {
      const newFolded = new Set(state.foldedNodes)
      if (newFolded.has(action.nodeId)) {
        newFolded.delete(action.nodeId)
      } else {
        newFolded.add(action.nodeId)
      }
      return { ...state, foldedNodes: newFolded }
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

    // ===== Zoom =====

    case "ZOOM_IN": {
      // Zoom is now just a root change - no stack needed
      // Parent can be derived from tree via parent_id
      return {
        ...state,
        rootId: action.nodeId,
        // Set cursor to provided cursorNodeId, or null if not provided (UI will initialize to first child)
        cursorNodeId: action.cursorNodeId ?? null,
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== Root Change =====

    case "SET_ROOT": {
      // Navigate to a different file/root
      const newHistory = [
        ...state.navHistory.slice(0, state.navHistoryIndex + 1),
        {
          rootId: state.rootId,
          rootPath: state.rootPath,
          cursorNodeId: state.cursorNodeId,
        },
      ]

      return {
        ...state,
        rootId: action.rootId,
        rootPath: action.rootPath,
        cursorNodeId: action.cursorNodeId,
        navHistory: newHistory,
        navHistoryIndex: newHistory.length,
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== Selection =====

    case "SELECT_NODE_ADD": {
      const newSelected = new Set(state.selectedNodes)
      newSelected.add(action.nodeId)
      return { ...state, selectedNodes: newSelected }
    }

    case "SELECT_NODE_REMOVE": {
      const newSelected = new Set(state.selectedNodes)
      newSelected.delete(action.nodeId)
      return { ...state, selectedNodes: newSelected }
    }

    case "SELECT_NODE_TOGGLE": {
      const newSelected = new Set(state.selectedNodes)
      if (newSelected.has(action.nodeId)) {
        newSelected.delete(action.nodeId)
      } else {
        newSelected.add(action.nodeId)
      }
      return { ...state, selectedNodes: newSelected }
    }

    case "CLEAR_SELECTION": {
      return { ...state, selectedNodes: new Set() }
    }

    // ===== Move Mode =====

    case "ENTER_MOVE_MODE": {
      if (action.nodeIds.length === 0) return state

      return {
        ...state,
        moveMode: true,
        moveSourceNodes: action.nodeIds,
        moveSourceCursorNodeId: action.cursorNodeId,
      }
    }

    case "CONFIRM_MOVE": {
      return {
        ...state,
        moveMode: false,
        moveSourceNodes: [],
        moveSourceCursorNodeId: null,
        selectedNodes: new Set(), // Clear selection after move
      }
    }

    case "CANCEL_MOVE": {
      return {
        ...state,
        moveMode: false,
        moveSourceNodes: [],
        cursorNodeId: state.moveSourceCursorNodeId ?? state.cursorNodeId,
        moveSourceCursorNodeId: null,
        curswantX: null,
        curswantY: null,
      }
    }

    // ===== View Configuration =====

    case "INCREASE_OUTLINE_DEPTH": {
      if (state.maxOutlineDepth >= 99) return state
      return { ...state, maxOutlineDepth: state.maxOutlineDepth + 1 }
    }

    case "DECREASE_OUTLINE_DEPTH": {
      if (state.maxOutlineDepth <= 0) return state
      return { ...state, maxOutlineDepth: state.maxOutlineDepth - 1 }
    }

    case "INCREASE_CONTENT_LINES": {
      if (state.maxContentLines >= 10) return state
      return { ...state, maxContentLines: state.maxContentLines + 1 }
    }

    case "DECREASE_CONTENT_LINES": {
      if (state.maxContentLines <= 0) return state
      return { ...state, maxContentLines: state.maxContentLines - 1 }
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
 * Create initial simplified board state
 */
export function createBoardState(
  rootId: string | null = null,
  rootPath: string | null = null,
  cursorNodeId: string | null = null,
): BoardState {
  return {
    rootId,
    rootPath,
    cursorNodeId,
    selectedNodes: new Set(),
    foldedNodes: new Set(),
    collapsedNodes: new Set(),
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursorNodeId: null,
    maxOutlineDepth: 99,
    maxContentLines: 2,
    curswantX: null,
    curswantY: null,
  }
}
