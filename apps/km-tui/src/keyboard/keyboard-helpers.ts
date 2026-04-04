/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { ID } from "@silvery/selection"
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
  cursorNodeId: string | null = null,
  foldDepths?: Map<string, number>,
): void {
  const entry = {
    rootId,
    colIndex,
    cardIndex,
    cursorNodeId,
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
    foldDepths: Map<string, number>
  },
): void {
  pushNavHistoryEntry(
    setUI,
    pane.rootId,
    0, // colIndex — derived at render, not available imperatively; unused in restore
    0, // cardIndex — same
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
  const anchorId = ctx.sel.node.anchor()
  if (!anchorId) return
  const newSelected: string[] = []

  // Resolve anchor position from nodeId
  const anchorPos = ctx.nodeIndex?.get(anchorId)
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
        newSelected.push(card.id)
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
          newSelected.push(card.id)
        }
      }
    }
  }

  ctx.sel.node.select(newSelected as ID[])

  // Show status feedback
  const count = newSelected.length
  if (anchorCol !== toCol) {
    const colCount = Math.abs(toCol - anchorCol) + 1
    ctx.setUI({
      status: {
        level: "info",
        message: `${colCount} column${colCount > 1 ? "s" : ""} selected (${count} items)`,
      },
    })
  } else if (count > 1) {
    ctx.setUI({ status: { level: "info", message: `${count} items selected` } })
  }
}

/** Clear all selection state */
export function clearSelection(ctx: ActionCtx): void {
  ctx.sel.deselect()
  ctx.setUI({ status: null })
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(ctx: ActionCtx, scope: SelectionScope): string[] {
  const selected: string[] = []

  if (scope === "card") {
    const card = ctx.columns[ctx.colIndex]?.cardNodes[ctx.cardIndex]
    if (card) {
      selected.push(card.id)
    }
  } else if (scope === "column") {
    const col = ctx.columns[ctx.colIndex]
    if (col) {
      for (const c of col.cardNodes) {
        selected.push(c.id)
      }
    }
  } else {
    for (const column of ctx.columns) {
      for (const c of column.cardNodes) {
        selected.push(c.id)
      }
    }
  }

  return selected
}

/**
 * Progressive select all with Shift+A.
 *
 * Uses the size of the current selection to determine the next scope
 * (replaces the old selectAllLevel counter).
 */
export function progressiveSelectAll(ctx: ActionCtx): void {
  const col = ctx.columns[ctx.colIndex]
  const card = col?.cardNodes[ctx.cardIndex]

  // Derive outline mode: cursor is inside a card's sub-items
  const inOutlineMode = ctx.cursorNodeId !== null && card !== undefined && ctx.cursorNodeId !== card.id
  const currentSize = ctx.selectedIds.size

  // Determine next scope based on current selection size
  let scope: SelectionScope
  if (currentSize === 0 && inOutlineMode && card) {
    scope = "card"
  } else if (col && currentSize <= (inOutlineMode ? 1 : 0)) {
    scope = "column"
  } else if (col && currentSize <= col.cardNodes.length) {
    scope = "board"
  } else {
    // Already at board level, cycle back
    scope = "board"
  }

  const newSelected = buildSelectAllSet(ctx, scope)
  ctx.sel.node.select(newSelected as ID[])
  ctx.setUI({
    status: {
      level: "info",
      message: `All ${newSelected.length} items in ${scope} selected`,
    },
  })
}
