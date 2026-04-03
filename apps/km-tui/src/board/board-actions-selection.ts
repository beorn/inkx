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

import { Tree } from "@km/tree"
import { updateSelectionRange } from "../keyboard/keyboard-helpers.ts"
import { handleTreeNavigation, type TreeDirection } from "../handlers/navigation-handlers.ts"
import type { ActionCtx } from "../tui-context.ts"

/**
 * Extend selection vertically (up or down).
 *
 * Level-aware: when cursor is on a sub-item (outline mode), selects among
 * siblings at the same depth. When at card level, selects between cards.
 */
export function handleExtendSelectVertical(ctx: ActionCtx, direction: "up" | "down"): void {
  const { ui, dispatchBoard } = ctx
  const col = ctx.column
  const card = ctx.card
  const cursorId = ctx.cursorNodeId

  if (!card || !col || !cursorId) return

  // Outline mode: cursor is on a sub-item within a card
  const inOutlineMode = cursorId !== card.id

  if (inOutlineMode) {
    return handleExtendSelectOutline(ctx, direction)
  }

  // Card-level selection (original behavior)
  const initAnchor = ui.selectionAnchor === null
  if (initAnchor) {
    const anchor = { nodeId: card.id }
    ctx.setUI({ selectionAnchor: anchor })
    ctx.ui.selectionAnchor = anchor
  }

  const targetIdx =
    direction === "up" ? Math.max(0, ctx.cardIndex - 1) : Math.min(col.cardNodes.length - 1, ctx.cardIndex + 1)

  if (targetIdx === ctx.cardIndex) {
    if (initAnchor) {
      const newSelected = new Set(ui.multiSelected)
      newSelected.add(card.id)
      ctx.setUI({
        multiSelected: newSelected,
        status: { level: "info", message: "1 item selected" },
      })
    }
    return
  }

  const treeDir: TreeDirection = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(treeDir, ctx, ctx.repo)
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    updateSelectionRange(ctx, ctx.colIndex, targetIdx)
  }
}

/**
 * Extend selection among siblings at the same depth (outline mode).
 * Uses Tree.siblings to navigate within the same parent.
 */
function handleExtendSelectOutline(ctx: ActionCtx, direction: "up" | "down"): void {
  const { ui, dispatchBoard, repo } = ctx
  const cursorId = ctx.cursorNodeId!

  // Get siblings at the same level
  const siblings = Tree.siblings(repo, cursorId)
  const curIdx = siblings.findIndex((s) => s.id === cursorId)
  if (curIdx === -1) return

  // Initialize anchor at current position
  if (ui.selectionAnchor === null) {
    const anchor = { nodeId: cursorId }
    ctx.setUI({ selectionAnchor: anchor })
    ctx.ui.selectionAnchor = anchor
  }

  // Find target sibling
  const targetIdx = direction === "up" ? curIdx - 1 : curIdx + 1
  if (targetIdx < 0 || targetIdx >= siblings.length) {
    // At boundary: "pop out" to parent — select the entire card.
    // This transitions from outline-mode (sub-item) to card-level selection.
    // Subsequent shift-selects will use card-level logic since cursor is on the card.
    const parent = Tree.parent(repo, cursorId)
    if (parent) {
      dispatchBoard({ type: "SELECT", nodeId: parent.id })
      ctx.setUI({
        selectionAnchor: { nodeId: parent.id },
        multiSelected: new Set([parent.id]),
        status: { level: "info", message: "1 item selected" },
      })
    }
    return
  }

  const targetId = siblings[targetIdx]!.id
  dispatchBoard({ type: "SELECT", nodeId: targetId })

  // Build selection range: all siblings between anchor and focus
  const anchorId = ui.selectionAnchor?.nodeId ?? cursorId
  const anchorIdx = siblings.findIndex((s) => s.id === anchorId)
  const newSelected = new Set<string>()
  const lo = Math.min(anchorIdx, targetIdx)
  const hi = Math.max(anchorIdx, targetIdx)
  for (let i = lo; i <= hi; i++) {
    newSelected.add(siblings[i]!.id)
  }

  ctx.setUI({
    multiSelected: newSelected,
    status: { level: "info", message: `${newSelected.size} item${newSelected.size > 1 ? "s" : ""} selected` },
  })
}

/**
 * Extend selection horizontally (left or right).
 * Selects entire columns between anchor and focus.
 */
export function handleExtendSelectHorizontal(ctx: ActionCtx, direction: "left" | "right"): void {
  const { ui, dispatchBoard } = ctx
  const columns = ctx.columns

  if (columns.length === 0) return

  // Resolve anchor column from nodeId (or use current cursor column)
  const anchorCol = resolveAnchorCol(ctx) ?? ctx.colIndex

  // Calculate target column (focus moves one step in direction)
  const targetColIdx =
    direction === "right" ? Math.min(columns.length - 1, ctx.colIndex + 1) : Math.max(0, ctx.colIndex - 1)

  // At boundary with no selection: select current column
  // At boundary with existing selection: do nothing
  if (targetColIdx === ctx.colIndex) {
    if (ui.multiSelected.size > 0) return
  }

  // Set anchor if starting fresh
  const card = ctx.card
  if (ui.selectionAnchor === null && card) {
    ctx.setUI({
      selectionAnchor: { nodeId: card.id },
    })
  }

  // Move cursor to first card in target column
  const targetCol = columns[targetColIdx]
  if (targetCol && targetCol.cardNodes.length > 0) {
    const targetCard = targetCol.cardNodes[0]
    if (targetCard) {
      dispatchBoard({ type: "SELECT", nodeId: targetCard.id })
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

/** Resolve the anchor's column index from its nodeId via layout.nodeIndex. */
function resolveAnchorCol(ctx: ActionCtx): number | null {
  const anchor = ctx.ui.selectionAnchor
  if (!anchor) return null
  const pos = ctx.nodeIndex?.get(anchor.nodeId)
  return pos?.colIndex ?? null
}

/** Select all cards in all columns between fromCol and toCol (inclusive). */
function selectColumnRange(ctx: ActionCtx, fromCol: number, toCol: number): Set<string> {
  const selected = new Set<string>()
  const minCol = Math.min(fromCol, toCol)
  const maxCol = Math.max(fromCol, toCol)

  for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
    const col = ctx.columns[colIdx]
    if (col) {
      for (const card of col.cardNodes) {
        selected.add(card.id)
      }
    }
  }
  return selected
}
