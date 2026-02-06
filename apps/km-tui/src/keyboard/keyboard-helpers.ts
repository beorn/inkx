/**
 * Keyboard Handler Helpers
 *
 * Utility functions for keyboard handling.
 */

import type { CardState, SelectionKey } from "../types.ts"
import { makeSelectionKey } from "../types.ts"
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

/** Update multi-selection range from anchor to current position */
export function updateSelectionRange(
  ctx: ActionCtx,
  toCol: number,
  toCard: number,
  toSub: number,
): void {
  if (!ctx.ui.selectionAnchor) return
  const newSelected = new Set<SelectionKey>()

  if (
    ctx.ui.selectionAnchor.col === toCol &&
    ctx.ui.selectionAnchor.card === toCard
  ) {
    const minSub = Math.min(ctx.ui.selectionAnchor.sub, toSub)
    const maxSub = Math.max(ctx.ui.selectionAnchor.sub, toSub)
    for (let s = minSub; s <= maxSub; s++) {
      newSelected.add(makeSelectionKey(toCol, toCard, s))
    }
  } else if (ctx.ui.selectionAnchor.col === toCol) {
    const minCard = Math.min(ctx.ui.selectionAnchor.card, toCard)
    const maxCard = Math.max(ctx.ui.selectionAnchor.card, toCard)
    for (let c = minCard; c <= maxCard; c++) {
      const card = ctx.layout.columns[toCol]?.cards[c]
      if (card) {
        const maxItems =
          1 +
          ctx.countVisibleDescendants(
            card.node,
            0,
            ctx.ui.maxOutlineDepth,
            ctx.boardState.foldedNodes,
          )
        for (let s = 0; s < maxItems; s++) {
          newSelected.add(makeSelectionKey(toCol, c, s))
        }
      }
    }
  }
  // Show status feedback
  const count = newSelected.size
  if (count > 1) {
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

/** Get unique selected card indices from multi-selection */
export function getSelectedCardIndices(ctx: ActionCtx): number[] {
  if (ctx.ui.multiSelected.size === 0) return []
  const indices = new Set<number>()
  for (const key of ctx.ui.multiSelected) {
    const [colStr, cardStr] = key.split(":")
    const col = parseInt(colStr ?? "0", 10)
    const card = parseInt(cardStr ?? "0", 10)
    if (col === ctx.layout.colIndex) {
      indices.add(card)
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
}

// =============================================================================
// State Refresh
// =============================================================================

/** Rebuild board state after a mutation, preserving navigation context */
export function refreshBoardState(
  ctx: ActionCtx,
  options?: {
    colIndex?: number
    cardIndex?: number | ((col: { cards: CardState[] } | undefined) => number)
  },
): void {
  // Columns are derived from repo via useColumns hook, which subscribes to
  // repo mutations via useSyncExternalStore. This function only needs to
  // update the cursor position after mutations.

  // Query repo to calculate new cursor position
  const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"])
  const allChildren = ctx.repo.getChildren(ctx.boardState.rootId)
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

  // Dispatch SELECT to update cursor position after mutations.
  const targetCard = cards[cardIndex]
  ctx.dispatchBoard({
    type: "SELECT",
    nodeId: targetCard?.id ?? ctx.boardState.cursorNodeId,
  })
}

// =============================================================================
// Progressive Selection
// =============================================================================

type SelectionScope = "card" | "column" | "board"

/** Add all visible items for a single card to the selection set */
function addCardItems(
  selected: Set<SelectionKey>,
  ctx: ActionCtx,
  colIdx: number,
  cardIdx: number,
  card: CardState,
): void {
  const maxItems =
    1 +
    ctx.countVisibleDescendants(
      card.node,
      0,
      ctx.ui.maxOutlineDepth,
      ctx.boardState.foldedNodes,
    )
  for (let s = 0; s < maxItems; s++) {
    selected.add(makeSelectionKey(colIdx, cardIdx, s))
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
      addCardItems(
        selected,
        ctx,
        ctx.layout.colIndex,
        ctx.layout.cardIndex,
        card,
      )
    }
  } else if (scope === "column") {
    const col = ctx.layout.columns[ctx.layout.colIndex]
    if (col) {
      for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
        const c = col.cards[cardIdx]
        if (c) addCardItems(selected, ctx, ctx.layout.colIndex, cardIdx, c)
      }
    }
  } else {
    for (let colIdx = 0; colIdx < ctx.layout.columns.length; colIdx++) {
      const column = ctx.layout.columns[colIdx]
      if (column) {
        for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
          const c = column.cards[cardIdx]
          if (c) addCardItems(selected, ctx, colIdx, cardIdx, c)
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
