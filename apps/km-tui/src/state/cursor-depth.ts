/**
 * CursorDepth — single source of truth for cursor depth classification.
 *
 * Classifies the cursor's position in the board hierarchy (board → column → card → subitem).
 * This is NOT the same as sel.kind (SelectionKind: "idle"/"node"/"text"/"path"/"crop"),
 * which describes the selection *mode*. CursorDepth describes the tree *position*.
 *
 * Extracted from cursor-store.ts during the CursorStore removal migration.
 * Renamed from SelectionLevel to CursorDepth to avoid confusion with SelectionKind.
 */

/** Four-level cursor depth: board → column → card → subitem */
export type CursorDepth = "board" | "column" | "card" | "subitem"

/** Three-level cursor depth used by rendering (subitem collapses to card) */
export type CursorDepth3 = "board" | "column" | "card"

// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional namespace pattern
export const CursorDepth = {
  /**
   * Derive the 4-level cursor depth from cursor node IDs.
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
  }): CursorDepth {
    if (!opts.cursorColumnNodeId) return "board"
    if (!opts.cursorCardNodeId) return "column"
    if (opts.cursorNodeId != null && opts.cursorNodeId !== opts.cursorCardNodeId) return "subitem"
    return "card"
  },

  /**
   * Derive the 3-level cursor depth from column layout indices.
   * Used by Board.tsx where indices are already computed from column layout.
   */
  fromIndices(colIndex: number, isAtCardLevel: boolean): CursorDepth3 {
    return colIndex < 0 ? "board" : isAtCardLevel ? "card" : "column"
  },

  /** Collapse 4-level to 3-level (subitem → card) for rendering consumers */
  toThreeLevel(level: CursorDepth): CursorDepth3 {
    return level === "subitem" ? "card" : level
  },

  /** True when cursor is inside a card at sub-item level */
  isOutline(level: CursorDepth): boolean {
    return level === "subitem"
  },
} as const
