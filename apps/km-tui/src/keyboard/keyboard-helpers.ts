/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { ActionCtx } from "../tui-context.ts"

// =============================================================================
// Navigation History
// =============================================================================

/** Push a new entry to navigation history */
function pushNavHistoryEntry(
  setUI: ActionCtx["setUI"],
  rootId: string | null,
  colIndex: number,
  cardIndex: number,
  multiSelected: Set<string>,
  cursorNodeId: string | null = null,
  foldDepths?: Map<string, number>,
): void {
  const entry = {
    rootId,
    colIndex,
    cardIndex,
    cursorNodeId,
    multiSelected: new Set(multiSelected),
    foldDepths: foldDepths ? new Map(foldDepths) : undefined,
  }
  setUI((prev) => {
    const h = [...prev.navHistory.slice(0, prev.navHistoryIndex), entry]
    return { navHistory: h, navHistoryIndex: h.length }
  })
}

/** Push nav history from ActionCtx (convenience wrapper) */
export function saveNavHistory(ctx: ActionCtx): void {
  pushNavHistoryEntry(
    ctx.setUI,
    ctx.rootId,
    ctx.colIndex,
    ctx.cardIndex,
    ctx.ui.multiSelected,
    ctx.cursorNodeId,
    ctx.foldDepths,
  )
}

/** Push nav history from pane state (for imperative use outside ActionCtx) */
export function saveNavHistoryFromPane(
  setUI: ActionCtx["setUI"],
  pane: {
    rootId: string | null
    cursorNodeId: string | null
    multiSelected: Set<string>
    foldDepths: Map<string, number>
  },
): void {
  pushNavHistoryEntry(
    setUI,
    pane.rootId,
    0, // colIndex — derived at render, not available imperatively; unused in restore
    0, // cardIndex — same
    pane.multiSelected,
    pane.cursorNodeId,
    pane.foldDepths,
  )
}

// =============================================================================
// Selection Helpers
// =============================================================================

/**
 * Update multi-selection range from anchor to current focus position.
 *
 * Selection is always derived from (anchor, focus):
 * - Same col, different cards: card range within column
 * - Different cols: all cards in all columns between anchor.col and focus.col
 */
export function updateSelectionRange(ctx: ActionCtx, toCol: number, toCard: number): void {
  if (!ctx.ui.selectionAnchor) return
  const anchor = ctx.ui.selectionAnchor
  const newSelected = new Set<string>()

  // Resolve anchor position from nodeId
  const anchorPos = ctx.nodeIndex?.get(anchor.nodeId)
  if (!anchorPos) return
  const anchorCol = anchorPos.colIndex
  const anchorCard = anchorPos.cardIndex

  if (anchorCol === toCol) {
    // Card range within the same column
    const minCard = Math.min(anchorCard, toCard)
    const maxCard = Math.max(anchorCard, toCard)
    for (let c = minCard; c <= maxCard; c++) {
      const card = ctx.columns[toCol]?.cardNodes[c]
      if (card) {
        newSelected.add(card.id)
      }
    }
  } else {
    // Cross-column: select all cards in all columns between anchor and focus
    const minCol = Math.min(anchorCol, toCol)
    const maxCol = Math.max(anchorCol, toCol)
    for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
      const col = ctx.columns[colIdx]
      if (col) {
        for (const card of col.cardNodes) {
          newSelected.add(card.id)
        }
      }
    }
  }

  // Show status feedback
  const count = newSelected.size
  if (anchorCol !== toCol) {
    const colCount = Math.abs(toCol - anchorCol) + 1
    ctx.setUI({
      multiSelected: newSelected,
      status: {
        level: "info",
        message: `${colCount} column${colCount > 1 ? "s" : ""} selected (${count} items)`,
      },
    })
  } else if (count > 1) {
    ctx.setUI({
      multiSelected: newSelected,
      status: { level: "info", message: `${count} items selected` },
    })
  } else {
    ctx.setUI({ multiSelected: newSelected })
  }
}

/** Clear all selection state */
export function clearSelection(ctx: ActionCtx): void {
  ctx.setUI({
    multiSelected: new Set(),
    selectionAnchor: null,
    selectAllLevel: 0,
    status: null,
  })
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(ctx: ActionCtx, scope: SelectionScope): Set<string> {
  const selected = new Set<string>()

  if (scope === "card") {
    const card = ctx.columns[ctx.colIndex]?.cardNodes[ctx.cardIndex]
    if (card) {
      selected.add(card.id)
    }
  } else if (scope === "column") {
    const col = ctx.columns[ctx.colIndex]
    if (col) {
      for (const c of col.cardNodes) {
        selected.add(c.id)
      }
    }
  } else {
    for (const column of ctx.columns) {
      for (const c of column.cardNodes) {
        selected.add(c.id)
      }
    }
  }

  return selected
}

/** Progressive select all with Shift+A */
export function progressiveSelectAll(ctx: ActionCtx): void {
  const col = ctx.columns[ctx.colIndex]
  const card = col?.cardNodes[ctx.cardIndex]
  const currentLevel = ctx.ui.selectAllLevel

  // Derive outline mode: cursor is inside a card's sub-items
  const inOutlineMode = ctx.cursorNodeId !== null && card !== undefined && ctx.cursorNodeId !== card.id

  let scope: SelectionScope
  let nextLevel: number
  if (currentLevel === 0 && inOutlineMode && card) {
    scope = "card"
    nextLevel = 1
  } else if (currentLevel <= 1 && col) {
    scope = "column"
    nextLevel = 2
  } else {
    scope = "board"
    nextLevel = 0
  }

  const newSelected = buildSelectAllSet(ctx, scope)
  ctx.setUI({
    multiSelected: newSelected,
    selectAllLevel: nextLevel,
    status: {
      level: "info",
      message: `All ${newSelected.size} items in ${scope} selected`,
    },
  })
}
