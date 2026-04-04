/**
 * Board Reducer for km-repl
 *
 * Simplified reducer for REPL navigation. Handles cursor movement,
 * selection, and fold/unfold operations needed for km sh commands.
 *
 * This is a local copy decoupled from @km/board - km-repl maintains
 * its own BoardState with the full tree for REPL navigation.
 */

import type { BoardState, BoardReducerOp, TNode, TPath, NodeDirection } from "./board-types.ts"

/**
 * Get node at a given path in the tree
 */
export function getNodeAtPath(nodes: TNode[], path: TPath): TNode | null {
  if (path.length === 0) return null

  let current = nodes
  for (let i = 0; i < path.length; i++) {
    const idx = path[i]
    if (idx === undefined || idx < 0 || idx >= current.length) return null
    const node = current[idx]
    if (!node) return null

    // If this is the last index in the path, return this node
    if (i === path.length - 1) {
      return node
    }

    // Otherwise, descend into children for next iteration
    current = node.children
  }

  return null
}

/**
 * Create initial board state from nodes
 */
export function createBoardState(nodes: TNode[], rootId: string | null, rootPath: string | null): BoardState {
  return {
    rootId,
    rootPath,
    nodes,
    cursor: nodes.length > 0 ? [0] : [],
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    selectedNodes: new Set(),
  }
}

/**
 * Find path to a node by ID (for cursorNodeId → cursor derivation)
 */
export function findPathToNode(nodes: TNode[], nodeId: string): TPath | null {
  function search(currentNodes: TNode[], currentPath: TPath): TPath | null {
    for (let i = 0; i < currentNodes.length; i++) {
      const node = currentNodes[i]
      if (!node) continue

      const pathToHere = [...currentPath, i]

      if (node.id === nodeId) {
        return pathToHere
      }

      if (node.children.length > 0) {
        const childResult = search(node.children, pathToHere)
        if (childResult) return childResult
      }
    }
    return null
  }

  return search(nodes, [])
}

/**
 * Handle cursor movement in a direction
 */
function handleCursorMove(state: BoardState, dir: NodeDirection): BoardState {
  const { nodes, cursor } = state

  // Get current level and siblings
  let siblings: TNode[]
  if (cursor.length === 0) {
    siblings = nodes
  } else {
    const parentPath = cursor.slice(0, -1)
    if (parentPath.length === 0) {
      siblings = nodes
    } else {
      const parent = getNodeAtPath(nodes, parentPath)
      if (!parent) return state
      siblings = parent.children
    }
  }

  const currentIdx = cursor[cursor.length - 1] ?? 0

  switch (dir) {
    case "next": {
      const nextIdx = currentIdx + 1
      if (nextIdx >= siblings.length) return state
      return {
        ...state,
        cursor: [...cursor.slice(0, -1), nextIdx],
      }
    }

    case "prev": {
      const prevIdx = currentIdx - 1
      if (prevIdx < 0) return state
      return {
        ...state,
        cursor: [...cursor.slice(0, -1), prevIdx],
      }
    }

    case "in": {
      const currentNode = siblings[currentIdx]
      if (!currentNode || currentNode.children.length === 0) return state
      if (state.foldDepths.get(currentNode.id) === 0) return state
      return {
        ...state,
        cursor: [...cursor, 0],
      }
    }

    case "out": {
      if (cursor.length <= 1) return state
      return {
        ...state,
        cursor: cursor.slice(0, -1),
      }
    }

    case "first": {
      if (siblings.length === 0) return state
      return {
        ...state,
        cursor: [...cursor.slice(0, -1), 0],
      }
    }

    case "last": {
      if (siblings.length === 0) return state
      return {
        ...state,
        cursor: [...cursor.slice(0, -1), siblings.length - 1],
      }
    }

    default:
      return state
  }
}

/**
 * Handle cross-column navigation (left/right at column level)
 */
function handleCrossColumn(state: BoardState, direction: "left" | "right"): BoardState {
  const { nodes, cursor } = state

  if (cursor.length === 0) return state

  const colIdx = cursor[0] ?? 0
  const newColIdx = direction === "right" ? colIdx + 1 : colIdx - 1

  if (newColIdx < 0 || newColIdx >= nodes.length) return state

  if (cursor.length === 1) {
    // At column level, just move to adjacent column
    return { ...state, cursor: [newColIdx] }
  }

  // At card level, try to preserve depth
  const newColumn = nodes[newColIdx]
  if (!newColumn) return state

  // Navigate to first card if column has children, else stay at column level
  if (newColumn.children.length > 0) {
    return { ...state, cursor: [newColIdx, 0] }
  }
  // Column is empty - stay at column level
  return { ...state, cursor: [newColIdx] }
}

/**
 * Handle selection operations
 */
function handleSelectAllSiblings(state: BoardState): BoardState {
  const { nodes, cursor } = state

  let siblings: TNode[]
  if (cursor.length === 0) {
    siblings = nodes
  } else {
    const parentPath = cursor.slice(0, -1)
    if (parentPath.length === 0) {
      siblings = nodes
    } else {
      const parent = getNodeAtPath(nodes, parentPath)
      if (!parent) return state
      siblings = parent.children
    }
  }

  const selectedNodes = new Set(siblings.map((n) => n.id))
  return { ...state, selectedNodes }
}

function handleClearSelection(state: BoardState): BoardState {
  return { ...state, selectedNodes: new Set() }
}

function handleExtendSelectDown(state: BoardState): BoardState {
  const { nodes, cursor, selectedNodes } = state
  const currentNode = getNodeAtPath(nodes, cursor)
  if (!currentNode) return state

  const newSelected = new Set(selectedNodes)
  newSelected.add(currentNode.id)

  // Move cursor down and add destination to selection
  const newState = handleCursorMove(state, "next")
  const destNode = getNodeAtPath(newState.nodes, newState.cursor)
  if (destNode) {
    newSelected.add(destNode.id)
  }
  return { ...newState, selectedNodes: newSelected }
}

function handleExtendSelectUp(state: BoardState): BoardState {
  const { nodes, cursor, selectedNodes } = state
  const currentNode = getNodeAtPath(nodes, cursor)
  if (!currentNode) return state

  const newSelected = new Set(selectedNodes)
  newSelected.add(currentNode.id)

  // Move cursor up and add destination to selection
  const newState = handleCursorMove(state, "prev")
  const destNode = getNodeAtPath(newState.nodes, newState.cursor)
  if (destNode) {
    newSelected.add(destNode.id)
  }
  return { ...newState, selectedNodes: newSelected }
}

/**
 * Handle fold/unfold operations
 */
function handleFoldLevel(state: BoardState, depth: number): BoardState {
  const { nodes, cursor } = state
  const currentNode = getNodeAtPath(nodes, cursor)
  if (!currentNode) return state

  const newDepths = new Map(state.foldDepths)

  // Fold children at depth
  function foldAtDepth(node: TNode, currentDepth: number) {
    if (currentDepth === depth) {
      newDepths.set(node.id, 0)
    } else if (currentDepth < depth) {
      for (const child of node.children) {
        foldAtDepth(child, currentDepth + 1)
      }
    }
  }

  foldAtDepth(currentNode, 0)
  return { ...state, foldDepths: newDepths }
}

function handleUnfoldLevel(state: BoardState, depth: number): BoardState {
  const { nodes, cursor } = state
  const currentNode = getNodeAtPath(nodes, cursor)
  if (!currentNode) return state

  const newDepths = new Map(state.foldDepths)

  // Unfold children at depth
  function unfoldAtDepth(node: TNode, currentDepth: number) {
    if (currentDepth === depth) {
      newDepths.delete(node.id)
    } else if (currentDepth < depth) {
      for (const child of node.children) {
        unfoldAtDepth(child, currentDepth + 1)
      }
    }
  }

  unfoldAtDepth(currentNode, 0)
  return { ...state, foldDepths: newDepths }
}

/**
 * Board state reducer - handles navigation and UI state
 */
// oxlint-disable-next-line complexity/complexity -- Exhaustive switch reducer pattern
export function boardReducer(state: BoardState, action: BoardReducerOp): BoardState {
  switch (action.type) {
    case "CURSOR_MOVE":
      return handleCursorMove(state, action.dir)

    case "NAV_CROSS_COLUMN":
      return handleCrossColumn(state, action.direction)

    case "NAV_TO_PATH": {
      if (action.path.length === 0) {
        return { ...state, cursor: [] }
      }
      const node = getNodeAtPath(state.nodes, action.path)
      if (!node) return state
      return { ...state, cursor: action.path }
    }

    case "NAV_BACK":
    case "NAV_FORWARD":
      // Navigation history not implemented in km-repl
      return state

    case "SELECT_ALL":
    case "SELECT_ALL_SIBLINGS":
      return handleSelectAllSiblings(state)

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

    case "CLEAR_SELECTION":
      return handleClearSelection(state)

    case "EXTEND_SELECT_DOWN":
      return handleExtendSelectDown(state)

    case "EXTEND_SELECT_UP":
      return handleExtendSelectUp(state)

    case "EXTEND_SELECT_LEFT":
    case "EXTEND_SELECT_RIGHT":
      // Horizontal extend-select not implemented in km-repl
      return state

    case "FOLD_LEVEL":
      return handleFoldLevel(state, action.depth)

    case "UNFOLD_LEVEL":
      return handleUnfoldLevel(state, action.depth)

    case "TOGGLE_FOLD": {
      const newDepths = new Map(state.foldDepths)
      if (newDepths.has(action.nodeId)) {
        newDepths.delete(action.nodeId)
      } else {
        newDepths.set(action.nodeId, 0)
      }
      return { ...state, foldDepths: newDepths }
    }

    case "TOGGLE_FOLD_CURRENT": {
      // Toggle fold on the node at cursor (no-op for leaf nodes)
      const currentNode = getNodeAtPath(state.nodes, state.cursor)
      if (!currentNode) return state
      // Only fold nodes that have children
      if (currentNode.children.length === 0) return state
      const newDepths = new Map(state.foldDepths)
      if (newDepths.has(currentNode.id)) {
        newDepths.delete(currentNode.id)
      } else {
        newDepths.set(currentNode.id, 0)
      }
      return { ...state, foldDepths: newDepths }
    }

    case "UNFOLD_ALL": {
      // Clear all fold depths
      return { ...state, foldDepths: new Map() }
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

    case "ENTER_MOVE_MODE":
    case "SHIFT_LEFT":
    case "SHIFT_RIGHT":
    case "CONFIRM_MOVE":
    case "CANCEL_MOVE":
      // Move mode not implemented in km-repl
      return state

    case "INCREASE_OUTLINE_DEPTH":
    case "DECREASE_OUTLINE_DEPTH":
    case "INCREASE_CONTENT_LINES":
    case "DECREASE_CONTENT_LINES":
      // View controls are TUI-only, no-op in km-repl
      return state

    default:
      return state
  }
}
