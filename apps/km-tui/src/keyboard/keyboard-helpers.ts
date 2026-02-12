/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { CardState, SelectionKey } from "../types.ts"
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
export function updateSelectionRange(
  ctx: ActionCtx,
  toCol: number,
  toCard: number,
  toSub: number,
): void {
  if (!ctx.ui.selectionAnchor) return
  const anchor = ctx.ui.selectionAnchor
  const newSelected = new Set<SelectionKey>()

  // Resolve anchor position from nodeId
  const anchorPos = ctx.layout.nodeIndex?.get(anchor.nodeId)
  if (!anchorPos) return
  const anchorCol = anchorPos.colIndex
  const anchorCard = anchorPos.cardIndex

  if (anchorCol === toCol && anchorCard === toCard) {
    // Sub-item range within the same card (outline mode)
    const minSub = Math.min(anchor.sub, toSub)
    const maxSub = Math.max(anchor.sub, toSub)
    const cardNode = ctx.layout.columns[toCol]?.cards[toCard]
    if (cardNode) {
      for (let s = minSub; s <= maxSub; s++) {
        newSelected.add(makeSelectionKey(cardNode.node.id, s))
      }
    }
  } else if (anchorCol === toCol) {
    // Card range within the same column
    const minCard = Math.min(anchorCard, toCard)
    const maxCard = Math.max(anchorCard, toCard)
    for (let c = minCard; c <= maxCard; c++) {
      const card = ctx.layout.columns[toCol]?.cards[c]
      if (card) {
        addAllCardItems(newSelected, ctx, card)
      }
    }
  } else {
    // Cross-column: select all cards in all columns between anchor and focus
    const minCol = Math.min(anchorCol, toCol)
    const maxCol = Math.max(anchorCol, toCol)
    for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
      const col = ctx.layout.columns[colIdx]
      if (col) {
        for (const card of col.cards) {
          addAllCardItems(newSelected, ctx, card)
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

/** Add all visible sub-items for a card to the selection set. */
function addAllCardItems(
  selected: Set<SelectionKey>,
  ctx: ActionCtx,
  card: CardState,
): void {
  const maxItems =
    1 +
    ctx.countVisibleDescendants(
      card.node,
      0,
      ctx.ui.maxOutlineDepth,
      ctx.foldedNodes,
    )
  for (let s = 0; s < maxItems; s++) {
    selected.add(makeSelectionKey(card.node.id, s))
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

/** Get unique selected card indices from multi-selection */
export function getSelectedCardIndices(ctx: ActionCtx): number[] {
  if (ctx.ui.multiSelected.size === 0) return []
  const nodeIndex = ctx.layout.nodeIndex
  if (!nodeIndex) return []
  const indices = new Set<number>()
  for (const key of ctx.ui.multiSelected) {
    const { nodeId } = parseSelectionKey(key)
    // Check nodeIndex for card roots
    const pos = nodeIndex.get(nodeId)
    if (pos && pos.colIndex === ctx.layout.colIndex) {
      indices.add(pos.cardIndex)
    }
    // For sub-items not in nodeIndex, walk parent chain
    if (!pos) {
      let current = ctx.repo.getNode(nodeId)
      while (current?.parent_id) {
        const parentPos = nodeIndex.get(current.parent_id)
        if (parentPos && parentPos.colIndex === ctx.layout.colIndex) {
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
// State Refresh
// =============================================================================

/** Rebuild board state after a mutation, preserving navigation context.
 *
 * @param options.usePositionHints - When true, pass computed colIndex/cardIndex
 *   directly to SELECT (bypasses stale nodeIndex). Use after addNode where the
 *   new node isn't in the nodeIndex yet.
 */
export function refreshBoardState(
  ctx: ActionCtx,
  options?: {
    colIndex?: number
    cardIndex?: number | ((col: { cards: CardState[] } | undefined) => number)
    usePositionHints?: boolean
  },
): void {
  // Columns are derived from repo via useColumns hook, which subscribes to
  // repo mutations via useSyncExternalStore. This function only needs to
  // update the cursor position after mutations.

  // Query repo to calculate new cursor position
  const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"])
  const allChildren = ctx.repo.getChildren(ctx.rootId)
  const columns = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type))

  // Calculate new cursor position
  const colIndex = options?.colIndex ?? ctx.layout.colIndex
  const colNode = columns[colIndex]
  const cards = colNode ? ctx.repo.getChildren(colNode.id) : []
  let cardIndex: number

  if (typeof options?.cardIndex === "function") {
    // cardIndex callback receives column shape with cards array
    const colShape = colNode
      ? { cards: cards.map((c) => ({ node: c, children: [] })) }
      : undefined
    cardIndex = options.cardIndex(colShape)
  } else {
    cardIndex = options?.cardIndex ?? ctx.layout.cardIndex
  }

  // Clamp card index to valid range
  const maxCardIndex = Math.max(0, cards.length - 1)
  cardIndex = Math.min(cardIndex, maxCardIndex)

  // Dispatch SELECT. When usePositionHints is set, pass colIndex/cardIndex
  // directly to bypass stale nodeIndex (e.g., after addNode before render).
  const targetCard = cards[cardIndex]
  const selectAction: {
    type: "SELECT"
    nodeId: string | null
    colIndex?: number
    cardIndex?: number
  } = {
    type: "SELECT",
    nodeId: targetCard?.id ?? ctx.cursorNodeId,
  }
  if (options?.usePositionHints) {
    selectAction.colIndex = colIndex
    selectAction.cardIndex = cardIndex
  }
  ctx.dispatchBoard(selectAction)
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Add all visible items for a single card to the selection set */
function addCardItems(
  selected: Set<SelectionKey>,
  ctx: ActionCtx,
  card: CardState,
): void {
  const maxItems =
    1 +
    ctx.countVisibleDescendants(
      card.node,
      0,
      ctx.ui.maxOutlineDepth,
      ctx.foldedNodes,
    )
  for (let s = 0; s < maxItems; s++) {
    selected.add(makeSelectionKey(card.node.id, s))
  }
}

/** Build a selection set for the given scope (card, column, or board) */
function buildSelectAllSet(
  ctx: ActionCtx,
  scope: SelectionScope,
): Set<SelectionKey> {
  const selected = new Set<SelectionKey>()

  if (scope === "card") {
    const card =
      ctx.layout.columns[ctx.layout.colIndex]?.cards[ctx.layout.cardIndex]
    if (card) {
      addCardItems(selected, ctx, card)
    }
  } else if (scope === "column") {
    const col = ctx.layout.columns[ctx.layout.colIndex]
    if (col) {
      for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
        const c = col.cards[cardIdx]
        if (c) addCardItems(selected, ctx, c)
      }
    }
  } else {
    for (let colIdx = 0; colIdx < ctx.layout.columns.length; colIdx++) {
      const column = ctx.layout.columns[colIdx]
      if (column) {
        for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
          const c = column.cards[cardIdx]
          if (c) addCardItems(selected, ctx, c)
        }
      }
    }
  }

  return selected
}

/** Progressive select all with Shift+A */
export function progressiveSelectAll(ctx: ActionCtx): void {
  const col = ctx.layout.columns[ctx.layout.colIndex]
  const card = col?.cards[ctx.layout.cardIndex]
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
