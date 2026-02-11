/**
 * Board Action Handlers - Selection Operations
 *
 * Handles multi-selection, range selection, and selection clearing.
 *
 * Selection uses an anchor/focus model:
 * - Anchor: set on first shift-movement, stays fixed
 * - Focus: moves with each shift-movement (= current cursor position)
 * - Shift-J/K: card-range selection within a column (updateSelectionRange)
 * - Shift-H/L: column-level selection (selectColumnRange)
 */

import { updateSelectionRange } from "../keyboard/keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "../handlers/navigation-handlers.ts"
import type { ActionCtx } from "../tui-context.ts"
import { makeSelectionKey, type SelectionKey } from "../types.ts"

/**
 * Extend selection vertically (up or down).
 * Moves focus up/down within the same column; selection derived from anchor to focus.
 */
export function handleExtendSelectVertical(
  ctx: ActionCtx,
  direction: "up" | "down",
): void {
  const { layout, ui, dispatchBoard } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card || !col) return

  // Initialize anchor if starting fresh
  if (ui.selectionAnchor === null) {
    const newSelected = new Set(ui.multiSelected)
    newSelected.add(makeSelectionKey(card.node.id, 0))
    ctx.setUI({
      selectionAnchor: { col: layout.colIndex, card: layout.cardIndex, sub: 0 },
      multiSelected: newSelected,
      status: { level: "info", message: "1 item selected" },
    })
  }

  // Calculate target
  const targetIdx =
    direction === "up"
      ? Math.max(0, layout.cardIndex - 1)
      : Math.min(col.cards.length - 1, layout.cardIndex + 1)

  if (targetIdx === layout.cardIndex) return

  // Move cursor (focus)
  const treeDir = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(treeDir as TreeDirection, ctx, ctx.repo)
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    // Derive selection from anchor to new focus
    updateSelectionRange(ctx, layout.colIndex, targetIdx, 0)
  }
}

/**
 * Extend selection horizontally (left or right).
 * Selects entire columns between anchor and focus.
 */
export function handleExtendSelectHorizontal(
  ctx: ActionCtx,
  direction: "left" | "right",
): void {
  const { layout, ui, dispatchBoard } = ctx
  const columns = layout.columns

  if (columns.length === 0) return

  const anchorCol = ui.selectionAnchor?.col ?? layout.colIndex

  // Calculate target column (focus moves one step in direction)
  const targetColIdx =
    direction === "right"
      ? Math.min(columns.length - 1, layout.colIndex + 1)
      : Math.max(0, layout.colIndex - 1)

  // At boundary with no selection: select current column
  // At boundary with existing selection: do nothing
  if (targetColIdx === layout.colIndex) {
    if (ui.multiSelected.size > 0) return
  }

  // Set anchor if starting fresh
  if (ui.selectionAnchor === null) {
    ctx.setUI({
      selectionAnchor: { col: layout.colIndex, card: layout.cardIndex, sub: 0 },
    })
  }

  // Move cursor to first card in target column
  const targetCol = columns[targetColIdx]
  if (targetCol && targetCol.cards.length > 0) {
    const targetCard = targetCol.cards[0]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.node.id })
    }
  }

  // Select all cards in columns between anchor and focus
  const newSelected = selectColumnRange(ctx, anchorCol, targetColIdx)
  const colCount = Math.abs(targetColIdx - anchorCol) + 1

  ctx.setUI({
    multiSelected: newSelected,
    status: {
      level: "info",
      message: `${colCount} column${colCount > 1 ? "s" : ""} selected (${newSelected.size} items)`,
    },
  })
}

/** Select all cards in all columns between fromCol and toCol (inclusive). */
function selectColumnRange(
  ctx: ActionCtx,
  fromCol: number,
  toCol: number,
): Set<SelectionKey> {
  const selected = new Set<SelectionKey>()
  const minCol = Math.min(fromCol, toCol)
  const maxCol = Math.max(fromCol, toCol)

  for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
    const col = ctx.layout.columns[colIdx]
    if (col) {
      for (const card of col.cards) {
        selected.add(makeSelectionKey(card.node.id, 0))
      }
    }
  }
  return selected
}
