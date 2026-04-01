/**
 * Board Types for km-repl
 *
 * Local type definitions for BoardState - decoupled from @km/board.
 * km-repl needs the full tree in state for navigation/rendering,
 * while the TUI uses SimplifiedBoardState with just cursorNodeId.
 */

import type { NodeRules, ItemData } from "@km/core"

/**
 * Tree path - array of indices into nodes/children arrays
 * Example: [0, 2, 1] = first top-level node → third child → second subchild
 */
export type TPath = number[]

/**
 * Tree node with children and metadata
 */
export interface TNode {
  // === Core KNode properties ===
  id: string
  type: string
  parent_id: string | null
  parent_idx: number
  item?: ItemData
  embed_source?: string | null
  name?: string
  title: string | null
  priority?: string
  due_at?: string
  start_at?: string
  content?: string
  rules?: NodeRules
  data: Record<string, unknown>
  created_at: number
  updated_at: number
  version: string

  // === Tree structure ===
  children: TNode[]
  childCount: number
  childrenLoaded: boolean
  isTask: boolean
  depth: number
}

/**
 * Board State for km-repl
 *
 * Contains full tree and cursor position for navigation.
 * This is the legacy state model used by km-repl's REPL commands.
 */
export interface BoardState {
  /** Root node ID being viewed (or null for repo root) */
  rootId: string | null
  /** Human-readable root path for display */
  rootPath: string | null
  /** Full tree nodes at current root level */
  nodes: TNode[]
  /** Cursor position as path through tree */
  cursor: TPath
  /** Node IDs → depth budgets (0 = folded, no entry = inherit) */
  foldDepths: Map<string, number>
  /** Node IDs that are collapsed (in outline mode) */
  collapsedNodes: Set<string>
  /** Node IDs that are selected */
  selectedNodes: Set<string>
}

/**
 * Navigation direction for cursor movement
 */
export type NodeDirection = "next" | "prev" | "in" | "out" | "first" | "last" | "up" | "down" | "left" | "right"

/**
 * Board Actions for km-repl
 *
 * Full set of actions supported by km-repl's command parser.
 * Some are no-ops in the reducer but are valid commands.
 */
export type BoardAction =
  // Navigation
  | { type: "CURSOR_MOVE"; dir: NodeDirection }
  | { type: "NAV_CROSS_COLUMN"; direction: "left" | "right" }
  | { type: "NAV_TO_PATH"; path: TPath }
  | { type: "NAV_BACK" }
  | { type: "NAV_FORWARD" }
  // Selection
  | { type: "SELECT_ALL" }
  | { type: "SELECT_ALL_SIBLINGS" }
  | { type: "SELECT_NODE_ADD"; nodeId: string }
  | { type: "SELECT_NODE_REMOVE"; nodeId: string }
  | { type: "SELECT_NODE_TOGGLE"; nodeId: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "EXTEND_SELECT_DOWN" }
  | { type: "EXTEND_SELECT_UP" }
  | { type: "EXTEND_SELECT_LEFT" }
  | { type: "EXTEND_SELECT_RIGHT" }
  // Fold/Collapse
  | { type: "FOLD_LEVEL"; depth: number }
  | { type: "UNFOLD_LEVEL"; depth: number }
  | { type: "TOGGLE_FOLD"; nodeId: string }
  | { type: "TOGGLE_FOLD_CURRENT" } // Toggle fold on cursor node
  | { type: "UNFOLD_ALL" } // Unfold all nodes
  | { type: "TOGGLE_COLLAPSE"; nodeId: string }
  // Move mode
  | { type: "ENTER_MOVE_MODE" }
  | { type: "SHIFT_LEFT" }
  | { type: "SHIFT_RIGHT" }
  | { type: "CONFIRM_MOVE" }
  | { type: "CANCEL_MOVE" }
  // View controls (TUI-only, no-op in repl)
  | { type: "INCREASE_OUTLINE_DEPTH" }
  | { type: "DECREASE_OUTLINE_DEPTH" }
  | { type: "INCREASE_CONTENT_LINES" }
  | { type: "DECREASE_CONTENT_LINES" }
