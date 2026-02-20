/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { KNode } from "@km/core"
import type { SelectionKey } from "../types.ts"
import { makeSelectionKey, parseSelectionKey } from "../types.ts"
import type { ActionCtx } from "../tui-context.ts"

// =============================================================================
// Navigation History
// =============================================================================

/** Push a new entry to navigation history */
export function pushNavHistoryEntry(
  setUI: ActionCtx["setUI"],
  rootId: string | null,
  colIndex: number,
  cardIndex: number,
  subIndex: number,
  multiSelected: Set<SelectionKey>,
  inOutlineMode: boolean,
  cursorNodeId: string | null = null,
  foldedNodes?: Set<string>,
): void {
  const entry = {
    rootId,
    colIndex,
    cardIndex,
    cursorNodeId,
    subIndex,
    multiSelected: new Set(multiSelected),
    inOutlineMode,
    foldedNodes: foldedNodes ? new Set(foldedNodes) : undefined,
  }
  setUI((prev) => {
    const h = [...prev.navHistory.slice(0, prev.navHistoryIndex), entry]
    return { navHistory: h, navHistoryIndex: h.length }
  })
}

/** Push nav history from ActionCtx (convenience wrapper to avoid 9-arg repetition) */
export function saveNavHistory(ctx: ActionCtx): void {
  pushNavHistoryEntry(
    ctx.setUI,
    ctx.rootId,
    ctx.colIndex,
    ctx.cardIndex,
    ctx.ui.subIndex,
    ctx.ui.multiSelected,
    ctx.ui.inOutlineMode,
    ctx.cursorNodeId,
    ctx.foldedNodes,
  )
}

// =============================================================================
// Selection Helpers
// =============================================================================

/**
 * Update multi-selection range from anchor to current focus position.
 *
 * Selection is always derived from (anchor, focus):
 * - Same col, same card: sub-item range (outline mode)
 * - Same col, different cards: card range within column
 * - Different cols: all cards in all columns between anchor.col and focus.col
 */
export function updateSelectionRange(ctx: ActionCtx, toCol: number, toCard: number, toSub: number): void {
  if (!ctx.ui.selectionAnchor) return
  const anchor = ctx.ui.selectionAnchor
  const newSelected = new Set<SelectionKey>()

  // Resolve anchor position from nodeId
  const anchorPos = ctx.nodeIndex?.get(anchor.nodeId)
  if (!anchorPos) return
  const anchorCol = anchorPos.colIndex
  const anchorCard = anchorPos.cardIndex

  if (anchorCol === toCol && anchorCard === toCard) {
    // Sub-item range within the same card (outline mode)
    const minSub = Math.min(anchor.sub, toSub)
    const maxSub = Math.max(anchor.sub, toSub)
    const cardNode = ctx.columns[toCol]?.cardNodes[toCard]
    if (cardNode) {
      for (let s = minSub; s <= maxSub; s++) {
        newSelected.add(makeSelectionKey(cardNode.id, s))
      }
    }
  } else if (anchorCol === toCol) {
    // Card range within the same column
    const minCard = Math.min(anchorCard, toCard)
    const maxCard = Math.max(anchorCard, toCard)
    for (let c = minCard; c <= maxCard; c++) {
      const card = ctx.columns[toCol]?.cardNodes[c]
      if (card) {
        addCardItems(newSelected, ctx, card)
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
          addCardItems(newSelected, ctx, card)
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

/**
 * Get cards to operate on: multi-selected cards if multiple are selected,
 * otherwise just the cursor card. Returns cards in column order.
 *
 * This is the standard way to make any card operation batch-aware:
 * `const cards = getSelectedCards(ctx)` gives you the right set to iterate.
 */
export function getSelectedCards(ctx: ActionCtx): KNode[] {
  const col = ctx.columns[ctx.colIndex]
  const cursorCard = col?.cardNodes[ctx.cardIndex]
  if (!col || !cursorCard) return []

  const indices = getSelectedCardIndices(ctx)
  if (indices.length > 1) {
    return indices.map((i) => col.cardNodes[i]).filter((c): c is KNode => c !== undefined)
  }
  return [cursorCard]
}

/** Get unique selected card indices from multi-selection */
export function getSelectedCardIndices(ctx: ActionCtx): number[] {
  if (ctx.ui.multiSelected.size === 0) return []
  const nodeIndex = ctx.nodeIndex
  if (!nodeIndex) return []
  const indices = new Set<number>()
  for (const key of ctx.ui.multiSelected) {
    const { nodeId } = parseSelectionKey(key)
    // Check nodeIndex for card roots
    const pos = nodeIndex.get(nodeId)
    if (pos && pos.colIndex === ctx.colIndex) {
      indices.add(pos.cardIndex)
    }
    // For sub-items not in nodeIndex, walk parent chain
    if (!pos) {
      let current = ctx.repo.getNode(nodeId)
      while (current?.parent_id) {
        const parentPos = nodeIndex.get(current.parent_id)
        if (parentPos && parentPos.colIndex === ctx.colIndex) {
          indices.add(parentPos.cardIndex)
          break
        }
        current = ctx.repo.getNode(current.parent_id)
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Add all visible items for a single card to the selection set */
function addCardItems(selected: Set<SelectionKey>, ctx: ActionCtx, card: KNode): void {
  const maxItems = 1 + ctx.countVisibleDescendants(card, 0, ctx.ui.maxOutlineDepth, ctx.foldedNodes)
  for (let s = 0; s < maxItems; s++) {
    selected.add(makeSelectionKey(card.id, s))
  }
}

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(ctx: ActionCtx, scope: SelectionScope): Set<SelectionKey> {
  const selected = new Set<SelectionKey>()

  if (scope === "card") {
    const card = ctx.columns[ctx.colIndex]?.cardNodes[ctx.cardIndex]
    if (card) {
      addCardItems(selected, ctx, card)
    }
  } else if (scope === "column") {
    const col = ctx.columns[ctx.colIndex]
    if (col) {
      for (let cardIdx = 0; cardIdx < col.cardNodes.length; cardIdx++) {
        const c = col.cardNodes[cardIdx]
        if (c) addCardItems(selected, ctx, c)
      }
    }
  } else {
    for (let colIdx = 0; colIdx < ctx.columns.length; colIdx++) {
      const column = ctx.columns[colIdx]
      if (column) {
        for (let cardIdx = 0; cardIdx < column.cardNodes.length; cardIdx++) {
          const c = column.cardNodes[cardIdx]
          if (c) addCardItems(selected, ctx, c)
        }
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

  let scope: SelectionScope
  let nextLevel: number
  if (currentLevel === 0 && ctx.ui.inOutlineMode && card) {
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
