/**
 * Board Action Handlers - Selection Operations
 *
 * Handles multi-selection, range selection, and selection clearing.
 * Uses @silvery/selection store (sel.node) for all selection state.
 */

import { Tree } from "@km/tree"
import { handleTreeNavigation, type TreeDirection } from "../handlers/navigation-handlers.ts"
import type { OpCtx } from "../tui-context.ts"
import type { ID } from "@silvery/selection"

/**
 * Extend selection vertically (up or down).
 *
 * Level-aware: when cursor is on a sub-item (outline mode), selects among
 * siblings at the same depth. When at card level, selects between cards.
 */
export function handleExtendSelectVertical(ctx: OpCtx, direction: "up" | "down"): void {
  const col = ctx.column
  const card = ctx.card
  const cursorId = ctx.cursorNodeId

  if (!card || !col || !cursorId) return

  // Outline mode: cursor is on a sub-item within a card
  const inOutlineMode = cursorId !== card.id

  if (inOutlineMode) {
    return handleExtendSelectOutline(ctx, direction)
  }

  // Card-level selection: extend from anchor through cursor
  const targetIdx =
    direction === "up" ? Math.max(0, ctx.cardIndex - 1) : Math.min(col.cardNodes.length - 1, ctx.cardIndex + 1)

  if (targetIdx === ctx.cardIndex) {
    // At boundary — if starting fresh, just select current card
    if (ctx.sel.node.ids().length <= 1) {
      ctx.sel.node.select([card.id as ID])
      ctx.setUI({ status: { level: "info", message: "1 item selected" } })
    }
    return
  }

  // Ensure anchor is established on current card before extending.
  // Without this, extend() has no anchor to range from.
  if (ctx.sel.node.ids().length === 0) {
    ctx.sel.node.select([card.id as ID])
  }

  const treeDir: TreeDirection = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(treeDir, ctx, ctx.repo)
  if (targetId) {
    ctx.sel.node.select([targetId as ID])
    ctx.sel.node.extend(targetId as ID)
    const count = ctx.sel.node.ids().length
    ctx.setUI({ status: { level: "info", message: `${count} item${count > 1 ? "s" : ""} selected` } })
  }
}

/**
 * Extend selection among siblings at the same depth (outline mode).
 * Uses Tree.siblings to navigate within the same parent.
 */
function handleExtendSelectOutline(ctx: OpCtx, direction: "up" | "down"): void {
  const { repo } = ctx
  const cursorId = ctx.cursorNodeId as string

  // Get siblings at the same level
  const node = repo.getNode(cursorId)
  if (!node?.parent_id) return
  const siblings = repo.getChildren(node.parent_id)
  const curIdx = siblings.findIndex((s) => s.id === cursorId)
  if (curIdx === -1) return

  // Find target sibling
  const targetIdx = direction === "up" ? curIdx - 1 : curIdx + 1
  if (targetIdx < 0 || targetIdx >= siblings.length) {
    // At boundary: "pop out" to parent — select the entire card.
    const parent = Tree.parent(repo, cursorId)
    if (parent) {
      ctx.sel.node.select([parent.id as ID])
      ctx.setUI({ status: { level: "info", message: "1 item selected" } })
    }
    return
  }

  // Ensure anchor is established on current node before extending.
  if (ctx.sel.node.ids().length === 0) {
    ctx.sel.node.select([cursorId as ID])
  }

  const targetId = siblings[targetIdx]!.id
  ctx.sel.node.select([targetId as ID])
  ctx.sel.node.extend(targetId as ID)

  const count = ctx.sel.node.ids().length
  ctx.setUI({
    status: { level: "info", message: `${count} item${count > 1 ? "s" : ""} selected` },
  })
}

/**
 * Extend selection horizontally (left or right).
 * Selects entire columns between anchor and focus.
 */
export function handleExtendSelectHorizontal(ctx: OpCtx, direction: "left" | "right"): void {
  const columns = ctx.columns

  if (columns.length === 0) return

  // Calculate target column (focus moves one step in direction)
  const targetColIdx =
    direction === "right" ? Math.min(columns.length - 1, ctx.colIndex + 1) : Math.max(0, ctx.colIndex - 1)

  // At boundary with existing selection: do nothing
  if (targetColIdx === ctx.colIndex) {
    if (ctx.selectedIds.size > 0) return
  }

  // Move cursor to first card in target column
  const targetCol = columns[targetColIdx]
  if (targetCol && targetCol.cardNodes.length > 0) {
    const targetCard = targetCol.cardNodes[0]
    if (targetCard) {
      ctx.sel.node.select([targetCard.id as ID])
    }
  }

  // Select all cards in columns between anchor column and target column
  const anchorColIdx = resolveAnchorCol(ctx) ?? ctx.colIndex
  const newSelected = selectColumnRange(ctx, anchorColIdx, targetColIdx)
  const colCount = Math.abs(targetColIdx - anchorColIdx) + 1

  ctx.sel.node.select(Array.from(newSelected) as ID[])
  ctx.setUI({
    status: {
      level: "info",
      message: `${colCount} column${colCount > 1 ? "s" : ""} selected (${newSelected.size} items)`,
    },
  })
}

/** Resolve the anchor's column index from sel.node.anchor via layout.nodeIndex. */
function resolveAnchorCol(ctx: OpCtx): number | null {
  const anchorId = ctx.sel.node.anchor()
  if (!anchorId) return null
  const pos = ctx.nodeIndex?.get(anchorId)
  return pos?.colIndex ?? null
}

/** Select all cards in all columns between fromCol and toCol (inclusive). */
function selectColumnRange(ctx: OpCtx, fromCol: number, toCol: number): Set<string> {
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
