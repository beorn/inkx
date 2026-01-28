/**
 * Navigation Handlers
 *
 * Pure navigation functions that compute the next cursor position.
 * Tree navigation uses Repo for tree structure.
 * Visual navigation uses LayoutRegistry for screen positions.
 *
 * These handlers return the new cursorNodeId or null if movement not possible.
 * The caller dispatches SELECT actions with the returned nodeId.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import createDebug from "debug"
import type { Repo } from "@km/storage"
import type { LayoutRegistry } from "./card-positions.ts"
import { getCardMidY } from "./card-positions.ts"
import type { BoardState } from "@km/board"

const debug = createDebug("km:tui:nav")

// =============================================================================
// Tree Navigation
// =============================================================================

/**
 * Tree navigation direction.
 * - next/prev: sibling navigation (mapped from cursor_down/cursor_up in board-actions)
 * - first/last: jump to first/last sibling
 * - child: enter first child
 * - parent: go to parent
 */
export type TreeDirection =
  | "next"
  | "prev"
  | "first"
  | "last"
  | "child"
  | "parent"

/**
 * Handle tree-based navigation.
 *
 * Uses Repo for tree structure queries. No visual layout involved.
 *
 * @param direction - Navigation direction ("next"/"prev" for siblings, "child"/"parent" for tree traversal)
 * @param state - Current board state (for cursorNodeId, rootId, foldedNodes)
 * @param repo - Repo for tree queries
 * @returns New cursorNodeId, or null if can't move
 */
export function handleTreeNavigation(
  direction: TreeDirection,
  state: BoardState,
  repo: Repo,
): string | null {
  const { cursorNodeId, rootId, foldedNodes } = state

  // If no cursor, can't navigate
  if (!cursorNodeId) {
    return null
  }

  const currentNode = repo.getNode(cursorNodeId)
  if (!currentNode) {
    debug("tree nav: current node not found")
    return null
  }

  switch (direction) {
    case "next": {
      // Move to next sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      const currentIndex = siblings.findIndex((n) => n.id === cursorNodeId)
      if (currentIndex < 0 || currentIndex >= siblings.length - 1) {
        debug("tree nav: at last sibling, can't move next")
        return null // At last sibling
      }
      const nextSibling = siblings[currentIndex + 1]
      debug("tree nav: next sibling %s", nextSibling?.id.slice(-8))
      return nextSibling?.id ?? null
    }

    case "prev": {
      // Move to previous sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      const currentIndex = siblings.findIndex((n) => n.id === cursorNodeId)
      if (currentIndex <= 0) {
        debug("tree nav: at first sibling, can't move prev")
        return null // At first sibling
      }
      const prevSibling = siblings[currentIndex - 1]
      debug("tree nav: prev sibling %s", prevSibling?.id.slice(-8))
      return prevSibling?.id ?? null
    }

    case "first": {
      // Jump to first sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      if (siblings.length === 0) {
        debug("tree nav: no siblings, can't jump to first")
        return null
      }
      const firstSibling = siblings[0]
      debug("tree nav: first sibling %s", firstSibling?.id.slice(-8))
      return firstSibling?.id ?? null
    }

    case "last": {
      // Jump to last sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      if (siblings.length === 0) {
        debug("tree nav: no siblings, can't jump to last")
        return null
      }
      const lastSibling = siblings[siblings.length - 1]
      debug("tree nav: last sibling %s", lastSibling?.id.slice(-8))
      return lastSibling?.id ?? null
    }

    case "child": {
      // Move to first child (if not folded and has children)
      if (foldedNodes.has(cursorNodeId)) {
        debug("tree nav: node is folded, can't enter child")
        return null
      }
      const children = repo.getChildren(cursorNodeId)
      if (children.length === 0) {
        debug("tree nav: no children, can't enter child")
        return null
      }
      const firstChild = children[0]
      debug("tree nav: first child %s", firstChild?.id.slice(-8))
      return firstChild?.id ?? null
    }

    case "parent": {
      // Move to parent
      if (currentNode.parent_id === null) {
        debug("tree nav: at repo root, can't move to parent")
        return null // At repo root (parent_id is null)
      }
      // Don't go above the current zoom root
      if (currentNode.parent_id === rootId) {
        debug("tree nav: at zoom root, returning to root")
        return rootId
      }
      // Check if parent is repo root (can't go above it)
      const parentNode = repo.getNode(currentNode.parent_id)
      if (parentNode && parentNode.parent_id === null) {
        debug("tree nav: parent is repo root, can't go higher")
        return null
      }
      debug("tree nav: parent %s", currentNode.parent_id.slice(-8))
      return currentNode.parent_id
    }

    default: {
      // Exhaustiveness check - TypeScript will error if new TreeDirection values are added
      const _exhaustive: never = direction
      throw new Error(
        `Unhandled tree direction: ${_exhaustive as string}. This is a programming error.`,
      )
    }
  }
}

/**
 * Get the first or last sibling of the current node.
 * Used for g/G (first/last sibling) navigation.
 *
 * @param direction - "first" or "last"
 * @param cursorNodeId - Current cursor node
 * @param repo - Repo for tree queries
 * @returns New cursorNodeId, or null if can't move
 */
export function handleSiblingJump(
  direction: "first" | "last",
  cursorNodeId: string | null,
  repo: Repo,
): string | null {
  if (!cursorNodeId) return null

  const currentNode = repo.getNode(cursorNodeId)
  if (!currentNode) return null

  const siblings = repo.getChildren(currentNode.parent_id)
  if (siblings.length === 0) return null

  if (direction === "first") {
    return siblings[0]?.id ?? null
  } else {
    return siblings[siblings.length - 1]?.id ?? null
  }
}

// =============================================================================
// Visual Navigation
// =============================================================================

/**
 * Handle visual (screen-based) navigation (h/l).
 *
 * Uses LayoutRegistry to find cards at screen positions.
 * Maintains sticky Y position for horizontal navigation sequences.
 *
 * @param direction - "left" or "right"
 * @param state - Current board state (for cursorNodeId)
 * @param repo - Repo for getting column structure
 * @param layout - Layout registry with card positions
 * @param rootId - Current zoom root (to get columns)
 * @returns New cursorNodeId, or null if can't move
 */
export function handleVisualNavigation(
  direction: "left" | "right",
  state: BoardState,
  repo: Repo,
  layout: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state

  if (!cursorNodeId) {
    return null
  }

  // Get current node's layout
  const currentLayout = layout.getNodeOptional(cursorNodeId)
  if (!currentLayout) {
    debug("visual nav: current node layout not found")
    return null
  }

  // Get columns (children of root)
  const columns = repo.getChildren(rootId)
  if (columns.length === 0) {
    return null
  }

  // Find which column the current node is in
  const currentColIndex = findColumnIndex(cursorNodeId, repo, rootId)
  if (currentColIndex < 0) {
    debug("visual nav: could not find current column")
    return null
  }

  // Calculate target column
  const targetColIndex =
    direction === "right" ? currentColIndex + 1 : currentColIndex - 1

  // Bounds check
  if (targetColIndex < 0 || targetColIndex >= columns.length) {
    debug("visual nav: at edge, can't move %s", direction)
    return null
  }

  // Get or set sticky Y position
  // Use head midpoint of current card as sticky Y
  let targetY = layout.getStickyY()
  if (targetY === null) {
    targetY = getCardMidY(currentLayout)
    layout.setStickyY(targetY)
    debug("visual nav: set stickyY=%d", targetY)
  }

  // Find card in target column at sticky Y position
  const cardIndex = layout.findCardAtYVisual(targetColIndex, targetY)

  if (cardIndex < 0) {
    // No cards in column, or should land on column header
    // Return the column node itself
    const columnNode = columns[targetColIndex]
    debug("visual nav: landing on column header %s", columnNode?.id.slice(-8))
    return columnNode?.id ?? null
  }

  // Get the card at that position
  const cardEntry = layout.getCardOptional(targetColIndex, cardIndex)
  if (!cardEntry) {
    debug("visual nav: card entry not found")
    return null
  }

  debug(
    "visual nav: %s to col=%d card=%d nodeId=%s",
    direction,
    targetColIndex,
    cardIndex,
    cardEntry.nodeId.slice(-8),
  )

  return cardEntry.nodeId
}

/**
 * Find which column index a node is in.
 * Works by traversing up to find the column ancestor.
 *
 * @param nodeId - Node to find
 * @param repo - Repo for tree queries
 * @param rootId - Current zoom root
 * @returns Column index, or -1 if not found
 */
function findColumnIndex(
  nodeId: string,
  repo: Repo,
  rootId: string | null,
): number {
  let current = repo.getNode(nodeId)
  if (!current) return -1

  // Traverse up to find the column (direct child of root)
  while (
    current &&
    current.parent_id !== null &&
    current.parent_id !== rootId
  ) {
    const parent = repo.getNode(current.parent_id)
    if (!parent) return -1
    current = parent
  }

  if (!current) return -1

  // Now 'current' is a direct child of root (a column)
  // Find its index among siblings
  const columns = repo.getChildren(rootId)
  const currentId = current.id
  return columns.findIndex((col) => col.id === currentId)
}

// =============================================================================
// Cursor Position Derivation
// =============================================================================

/**
 * Derive visual indices (colIndex, cardIndex) from cursorNodeId.
 * Used at render time to position the cursor.
 *
 * @param cursorNodeId - Current cursor node
 * @param repo - Repo for tree queries
 * @param rootId - Current zoom root
 * @returns { colIndex, cardIndex } or null if not in a column/card position
 */
export function deriveCursorPosition(
  cursorNodeId: string | null,
  repo: Repo,
  rootId: string | null,
): { colIndex: number; cardIndex: number } | null {
  if (!cursorNodeId) {
    return null
  }

  const columns = repo.getChildren(rootId)
  if (columns.length === 0) {
    return null
  }

  // Check if cursor is on a column itself
  const colIndex = columns.findIndex((col) => col.id === cursorNodeId)
  if (colIndex >= 0) {
    // Cursor is on a column header
    return { colIndex, cardIndex: -1 }
  }

  // Otherwise, find which column and card the cursor is in
  for (let ci = 0; ci < columns.length; ci++) {
    const column = columns[ci]
    if (!column) continue

    const cards = repo.getChildren(column.id)
    const cardIndex = cards.findIndex((card) => card.id === cursorNodeId)
    if (cardIndex >= 0) {
      return { colIndex: ci, cardIndex }
    }

    // Check if cursor is in a nested child of this column
    for (let cai = 0; cai < cards.length; cai++) {
      const card = cards[cai]
      if (!card) continue
      if (isDescendant(cursorNodeId, card.id, repo)) {
        return { colIndex: ci, cardIndex: cai }
      }
    }
  }

  return null
}

/**
 * Check if nodeId is a descendant of ancestorId.
 */
function isDescendant(nodeId: string, ancestorId: string, repo: Repo): boolean {
  let current = repo.getNode(nodeId)
  while (current && current.parent_id) {
    if (current.parent_id === ancestorId) {
      return true
    }
    current = repo.getNode(current.parent_id)
  }
  return false
}

// =============================================================================
// Clear Sticky Y on Vertical Navigation
// =============================================================================

/**
 * Should be called when doing vertical navigation (j/k).
 * Clears the sticky Y so next h/l uses fresh position.
 */
export function clearStickyY(layout: LayoutRegistry): void {
  layout.clearStickyY()
}
