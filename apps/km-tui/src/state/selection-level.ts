/**
 * SelectionLevel — single source of truth for cursor depth classification.
 *
 * Extracted from cursor-store.ts during the CursorStore removal migration.
 */

/** Four-level selection depth: board → column → card → subitem */
export type SelectionLevel = "board" | "column" | "card" | "subitem"

/** Three-level selection depth used by rendering (subitem collapses to card) */
export type SelectionLevel3 = "board" | "column" | "card"

// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional namespace pattern
export const SelectionLevel = {
  /**
   * Derive the 4-level selection depth from cursor node IDs.
   *
   * - "board": no column (cursor is at the board root)
   * - "column": in a column, but not at card level
   * - "card": at a card (cursorNodeId === cursorCardNodeId)
   * - "subitem": inside a card's children (cursorNodeId !== cursorCardNodeId)
   */
  derive(opts: {
    cursorNodeId: string | null
    cursorCardNodeId: string | null
    cursorColumnNodeId: string | null
  }): SelectionLevel {
    if (!opts.cursorColumnNodeId) return "board"
    if (!opts.cursorCardNodeId) return "column"
    if (opts.cursorNodeId != null && opts.cursorNodeId !== opts.cursorCardNodeId) return "subitem"
    return "card"
  },

  /**
   * Derive the 3-level selection depth from column layout indices.
   * Used by Board.tsx where indices are already computed from column layout.
   */
  fromIndices(colIndex: number, isAtCardLevel: boolean): SelectionLevel3 {
    return colIndex < 0 ? "board" : isAtCardLevel ? "card" : "column"
  },

  /** Collapse 4-level to 3-level (subitem → card) for rendering consumers */
  toThreeLevel(level: SelectionLevel): SelectionLevel3 {
    return level === "subitem" ? "card" : level
  },

  /** True when cursor is inside a card at sub-item level */
  isOutline(level: SelectionLevel): boolean {
    return level === "subitem"
  },
} as const
