/**
 * useCursorPosition Hook
 *
 * Derives visual cursor position (colIndex, cardIndex) from cursorNodeId.
 * This replaces storing indices in state - they're now computed at render time.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { useMemo } from "react"
import type { ColumnState } from "../types.ts"

// =============================================================================
// Types
// =============================================================================

export interface CursorPosition {
  /** Column index (-1 if at board level or not found) */
  colIndex: number
  /** Card index (-1 if at column level or not found) */
  cardIndex: number
  /** Whether cursor is at card level */
  isAtCardLevel: boolean
  /** Selection level for styling */
  selectionLevel: "board" | "column" | "card"
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Derive cursor position from cursorNodeId.
 *
 * @param columns - Current column layout
 * @param cursorNodeId - Currently selected node ID
 * @returns CursorPosition with indices and selection level
 */
export function useCursorPosition(
  columns: ColumnState[],
  cursorNodeId: string | null,
): CursorPosition {
  return useMemo(() => {
    return deriveCursorPosition(columns, cursorNodeId)
  }, [columns, cursorNodeId])
}

/**
 * Pure function to derive cursor position.
 * Can be used outside of React for testing.
 */
export function deriveCursorPosition(
  columns: ColumnState[],
  cursorNodeId: string | null,
): CursorPosition {
  // No cursor = board level
  if (!cursorNodeId || columns.length === 0) {
    return {
      colIndex: -1,
      cardIndex: -1,
      isAtCardLevel: false,
      selectionLevel: "board",
    }
  }

  // Search for cursor node in columns
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const column = columns[colIdx]
    if (!column) continue

    // Check if cursor is on the column itself
    if (column.node.id === cursorNodeId) {
      return {
        colIndex: colIdx,
        cardIndex: -1,
        isAtCardLevel: false,
        selectionLevel: "column",
      }
    }

    // Check if cursor is on a card in this column
    for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
      const card = column.cards[cardIdx]
      if (!card) continue

      if (card.node.id === cursorNodeId) {
        return {
          colIndex: colIdx,
          cardIndex: cardIdx,
          isAtCardLevel: true,
          selectionLevel: "card",
        }
      }

      // Check if cursor is in a descendant of this card
      if (isDescendantOf(cursorNodeId, card.children)) {
        return {
          colIndex: colIdx,
          cardIndex: cardIdx,
          isAtCardLevel: true,
          selectionLevel: "card",
        }
      }
    }
  }

  // Cursor node not found in visible columns
  // This can happen after zoom or if node is outside current view
  return {
    colIndex: -1,
    cardIndex: -1,
    isAtCardLevel: false,
    selectionLevel: "board",
  }
}

/**
 * Check if nodeId is a descendant of any node in the children array.
 */
function isDescendantOf(
  nodeId: string,
  children: { id: string; children?: unknown[] }[],
): boolean {
  for (const child of children) {
    if (child.id === nodeId) {
      return true
    }
    // Type assertion for recursive check
    const nestedChildren = (child as { children?: { id: string }[] }).children
    if (
      nestedChildren &&
      isDescendantOf(
        nodeId,
        nestedChildren as { id: string; children?: unknown[] }[],
      )
    ) {
      return true
    }
  }
  return false
}
