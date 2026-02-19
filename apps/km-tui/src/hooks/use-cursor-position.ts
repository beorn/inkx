/**
 * Cursor Position Derivation — VIEW MODEL
 *
 * Derives visual cursor position (colIndex, cardIndex) from cursorNodeId.
 * This replaces storing indices in state - they're now computed at render time.
 *
 * Uses nodeIndex for O(1) lookup — no scanning required.
 *
 * NODE MODEL V2: colIndex/cardIndex are view model concepts — they exist because
 * the grid layout needs integer positions. Target: replace with spatial lookup
 * via GridNavigator that translates cursorNodeId → screen position on demand.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { createLogger } from "@beorn/logger"
import { type ColumnState, COLUMN_HEADER_INDEX } from "../types.ts"

const log = createLogger("km:perf")

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

/**
 * Pure function to derive cursor position.
 * Can be used outside of React for testing and in the store for synchronous layout.
 *
 * @param nodeIndex - O(1) lookup map from nodeId to grid position.
 */
export function deriveCursorPosition(
  columns: ColumnState[],
  cursorNodeId: string | null,
  nodeIndex: Map<string, { colIndex: number; cardIndex: number }>,
): CursorPosition {
  // No cursor = board level
  if (!cursorNodeId || columns.length === 0) {
    return {
      colIndex: -1,
      cardIndex: COLUMN_HEADER_INDEX,
      isAtCardLevel: false,
      selectionLevel: "board",
    }
  }

  // O(1) lookup via nodeIndex
  const pos = nodeIndex.get(cursorNodeId)
  if (pos) {
    const isColumnHeader = pos.cardIndex === COLUMN_HEADER_INDEX
    return {
      colIndex: pos.colIndex,
      cardIndex: pos.cardIndex,
      isAtCardLevel: !isColumnHeader,
      selectionLevel: isColumnHeader ? "column" : "card",
    }
  }

  // Cursor node not found in visible columns
  log.debug?.(`cursor node ${cursorNodeId?.slice(-8)} not found in nodeIndex (${nodeIndex.size} entries)`)
  return {
    colIndex: -1,
    cardIndex: COLUMN_HEADER_INDEX,
    isAtCardLevel: false,
    selectionLevel: "board",
  }
}
