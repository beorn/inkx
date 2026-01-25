/**
 * Navigation Handlers
 *
 * Pure navigation functions that compute the next cursor position.
 * Tree navigation uses Vault for tree structure.
 * Visual navigation uses LayoutRegistry for screen positions.
 *
 * These handlers return the new cursorNodeId or null if movement not possible.
 * The caller dispatches SELECT actions with the returned nodeId.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import createDebug from "debug";
import type { Vault } from "@km/storage";
import type { LayoutRegistry, NodeLayout } from "./card-positions.ts";
import { getCardMidY } from "./card-positions.ts";
import type { SimplifiedBoardState } from "@km/board";

const debug = createDebug("km:tui:nav");

// =============================================================================
// Tree Navigation
// =============================================================================

/**
 * Tree navigation direction.
 * - next/prev: sibling navigation (j/k keys)
 * - child: enter first child (Enter key)
 * - parent: go to parent (Backspace key)
 */
export type TreeDirection = "next" | "prev" | "child" | "parent";

/**
 * Handle tree-based navigation (j/k/Enter/Backspace).
 *
 * Uses Vault for tree structure queries. No visual layout involved.
 *
 * @param direction - Navigation direction
 * @param state - Current board state (for cursorNodeId, rootId, foldedNodes)
 * @param vault - Vault for tree queries
 * @returns New cursorNodeId, or null if can't move
 */
export function handleTreeNavigation(
  direction: TreeDirection,
  state: SimplifiedBoardState,
  vault: Vault,
): string | null {
  const { cursorNodeId, rootId, foldedNodes } = state;

  // If no cursor, can't navigate
  if (!cursorNodeId) {
    return null;
  }

  const currentNode = vault.getNode(cursorNodeId);
  if (!currentNode) {
    debug("tree nav: current node not found");
    return null;
  }

  switch (direction) {
    case "next": {
      // Move to next sibling
      const siblings = vault.getChildren(currentNode.parent_id);
      const currentIndex = siblings.findIndex((n) => n.id === cursorNodeId);
      if (currentIndex < 0 || currentIndex >= siblings.length - 1) {
        debug("tree nav: at last sibling, can't move next");
        return null; // At last sibling
      }
      const nextSibling = siblings[currentIndex + 1];
      debug("tree nav: next sibling %s", nextSibling?.id.slice(-8));
      return nextSibling?.id ?? null;
    }

    case "prev": {
      // Move to previous sibling
      const siblings = vault.getChildren(currentNode.parent_id);
      const currentIndex = siblings.findIndex((n) => n.id === cursorNodeId);
      if (currentIndex <= 0) {
        debug("tree nav: at first sibling, can't move prev");
        return null; // At first sibling
      }
      const prevSibling = siblings[currentIndex - 1];
      debug("tree nav: prev sibling %s", prevSibling?.id.slice(-8));
      return prevSibling?.id ?? null;
    }

    case "child": {
      // Move to first child (if not folded and has children)
      if (foldedNodes.has(cursorNodeId)) {
        debug("tree nav: node is folded, can't enter child");
        return null;
      }
      const children = vault.getChildren(cursorNodeId);
      if (children.length === 0) {
        debug("tree nav: no children, can't enter child");
        return null;
      }
      const firstChild = children[0];
      debug("tree nav: first child %s", firstChild?.id.slice(-8));
      return firstChild?.id ?? null;
    }

    case "parent": {
      // Move to parent
      if (currentNode.parent_id === null) {
        debug("tree nav: at root level, can't move to parent");
        return null; // At root level
      }
      // Don't go above the current zoom root
      if (currentNode.parent_id === rootId) {
        debug("tree nav: at zoom root, returning to root");
        return rootId;
      }
      debug("tree nav: parent %s", currentNode.parent_id.slice(-8));
      return currentNode.parent_id;
    }

    default:
      return null;
  }
}

/**
 * Get the first or last sibling of the current node.
 * Used for g/G (first/last sibling) navigation.
 *
 * @param direction - "first" or "last"
 * @param cursorNodeId - Current cursor node
 * @param vault - Vault for tree queries
 * @returns New cursorNodeId, or null if can't move
 */
export function handleSiblingJump(
  direction: "first" | "last",
  cursorNodeId: string | null,
  vault: Vault,
): string | null {
  if (!cursorNodeId) return null;

  const currentNode = vault.getNode(cursorNodeId);
  if (!currentNode) return null;

  const siblings = vault.getChildren(currentNode.parent_id);
  if (siblings.length === 0) return null;

  if (direction === "first") {
    return siblings[0]?.id ?? null;
  } else {
    return siblings[siblings.length - 1]?.id ?? null;
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
 * @param vault - Vault for getting column structure
 * @param layout - Layout registry with card positions
 * @param rootId - Current zoom root (to get columns)
 * @returns New cursorNodeId, or null if can't move
 */
export function handleVisualNavigation(
  direction: "left" | "right",
  state: SimplifiedBoardState,
  vault: Vault,
  layout: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state;

  if (!cursorNodeId) {
    return null;
  }

  // Get current node's layout
  const currentLayout = layout.getNodeOptional(cursorNodeId);
  if (!currentLayout) {
    debug("visual nav: current node layout not found");
    return null;
  }

  // Get columns (children of root)
  const columns = vault.getChildren(rootId);
  if (columns.length === 0) {
    return null;
  }

  // Find which column the current node is in
  const currentColIndex = findColumnIndex(cursorNodeId, vault, rootId);
  if (currentColIndex < 0) {
    debug("visual nav: could not find current column");
    return null;
  }

  // Calculate target column
  const targetColIndex =
    direction === "right" ? currentColIndex + 1 : currentColIndex - 1;

  // Bounds check
  if (targetColIndex < 0 || targetColIndex >= columns.length) {
    debug("visual nav: at edge, can't move %s", direction);
    return null;
  }

  // Get or set sticky Y position
  // Use head midpoint of current card as sticky Y
  let targetY = layout.getStickyY();
  if (targetY === null) {
    targetY = getCardMidY(currentLayout);
    layout.setStickyY(targetY);
    debug("visual nav: set stickyY=%d", targetY);
  }

  // Find card in target column at sticky Y position
  const cardIndex = layout.findCardAtYVisual(targetColIndex, targetY);

  if (cardIndex < 0) {
    // No cards in column, or should land on column header
    // Return the column node itself
    const columnNode = columns[targetColIndex];
    debug("visual nav: landing on column header %s", columnNode?.id.slice(-8));
    return columnNode?.id ?? null;
  }

  // Get the card at that position
  const cardEntry = layout.getCardOptional(targetColIndex, cardIndex);
  if (!cardEntry) {
    debug("visual nav: card entry not found");
    return null;
  }

  debug(
    "visual nav: %s to col=%d card=%d nodeId=%s",
    direction,
    targetColIndex,
    cardIndex,
    cardEntry.nodeId.slice(-8),
  );

  return cardEntry.nodeId;
}

/**
 * Find which column index a node is in.
 * Works by traversing up to find the column ancestor.
 *
 * @param nodeId - Node to find
 * @param vault - Vault for tree queries
 * @param rootId - Current zoom root
 * @returns Column index, or -1 if not found
 */
function findColumnIndex(
  nodeId: string,
  vault: Vault,
  rootId: string | null,
): number {
  let current = vault.getNode(nodeId);
  if (!current) return -1;

  // Traverse up to find the column (direct child of root)
  while (
    current &&
    current.parent_id !== null &&
    current.parent_id !== rootId
  ) {
    const parent = vault.getNode(current.parent_id);
    if (!parent) return -1;
    current = parent;
  }

  if (!current) return -1;

  // Now 'current' is a direct child of root (a column)
  // Find its index among siblings
  const columns = vault.getChildren(rootId);
  const currentId = current.id;
  return columns.findIndex((col) => col.id === currentId);
}

// =============================================================================
// Cursor Position Derivation
// =============================================================================

/**
 * Derive visual indices (colIndex, cardIndex) from cursorNodeId.
 * Used at render time to position the cursor.
 *
 * @param cursorNodeId - Current cursor node
 * @param vault - Vault for tree queries
 * @param rootId - Current zoom root
 * @returns { colIndex, cardIndex } or null if not in a column/card position
 */
export function deriveCursorPosition(
  cursorNodeId: string | null,
  vault: Vault,
  rootId: string | null,
): { colIndex: number; cardIndex: number } | null {
  if (!cursorNodeId) {
    return null;
  }

  const columns = vault.getChildren(rootId);
  if (columns.length === 0) {
    return null;
  }

  // Check if cursor is on a column itself
  const colIndex = columns.findIndex((col) => col.id === cursorNodeId);
  if (colIndex >= 0) {
    // Cursor is on a column header
    return { colIndex, cardIndex: -1 };
  }

  // Otherwise, find which column and card the cursor is in
  for (let ci = 0; ci < columns.length; ci++) {
    const column = columns[ci];
    if (!column) continue;

    const cards = vault.getChildren(column.id);
    const cardIndex = cards.findIndex((card) => card.id === cursorNodeId);
    if (cardIndex >= 0) {
      return { colIndex: ci, cardIndex };
    }

    // Check if cursor is in a nested child of this column
    for (let cai = 0; cai < cards.length; cai++) {
      const card = cards[cai];
      if (!card) continue;
      if (isDescendant(cursorNodeId, card.id, vault)) {
        return { colIndex: ci, cardIndex: cai };
      }
    }
  }

  return null;
}

/**
 * Check if nodeId is a descendant of ancestorId.
 */
function isDescendant(
  nodeId: string,
  ancestorId: string,
  vault: Vault,
): boolean {
  let current = vault.getNode(nodeId);
  while (current && current.parent_id) {
    if (current.parent_id === ancestorId) {
      return true;
    }
    current = vault.getNode(current.parent_id);
  }
  return false;
}

// =============================================================================
// Clear Sticky Y on Vertical Navigation
// =============================================================================

/**
 * Should be called when doing vertical navigation (j/k).
 * Clears the sticky Y so next h/l uses fresh position.
 */
export function clearStickyY(layout: LayoutRegistry): void {
  layout.clearStickyY();
}
