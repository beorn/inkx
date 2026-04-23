/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
import { nodeSelect, nodesSelect } from "../state/selection.ts"

/**
 * Extend selection vertically (up or down).
 *
 * Level-aware: when cursor is on a sub-item (outline mode), selects among
 * siblings at the same depth. When at card level, selects between cards.
 */
export function handleExtendSelectVertical(ctx: OpCtx, direction: "up" | "down"): void {
  const card = ctx.card
  const cursorId = ctx.cursor

  if (!card || !ctx.columnId || !cursorId) return

  // Outline mode: cursor is on a sub-item within a card
  const inOutlineMode = cursorId !== card.id

  if (inOutlineMode) {
    return handleExtendSelectOutline(ctx, direction)
  }

  // Card-level selection: extend from anchor through cursor
  const cardCount = ctx.tree.children(ctx.columnId).length
  const targetIdx = direction === "up" ? Math.max(0, ctx.cardIndex - 1) : Math.min(cardCount - 1, ctx.cardIndex + 1)

  if (targetIdx === ctx.cardIndex) {
    // At boundary — if starting fresh, just select current card
    if (ctx.sel.node.ids().length <= 1) {
      ctx.setSelection(nodeSelect(card.id))
      ctx.setUI({ status: { level: "info", message: "1 item selected" } })
    }
    return
  }

  // Ensure anchor is established on current card before extending.
  // Without this, extend() has no anchor to range from.
  if (ctx.sel.node.ids().length === 0) {
    ctx.setSelection(nodeSelect(card.id))
  }

  const treeDir: TreeDirection = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(treeDir, ctx, ctx.repo)
  if (targetId) {
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
  const cursorId = ctx.cursor as string

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
      ctx.setSelection(nodeSelect(parent.id))
      ctx.setUI({ status: { level: "info", message: "1 item selected" } })
    }
    return
  }

  // Ensure anchor is established on current node before extending.
  if (ctx.sel.node.ids().length === 0) {
    ctx.setSelection(nodeSelect(cursorId))
  }

  const targetId = siblings[targetIdx]!.id
  ctx.sel.node.extend(targetId as ID)

  const count = ctx.sel.node.ids().length
  ctx.setUI({
    status: { level: "info", message: `${count} item${count > 1 ? "s" : ""} selected` },
  })
}

/**
 * Extend selection horizontally (left or right).
 * Selects entire columns between anchor and focus.
 *
 * Bug history: this previously wiped the selection to a single card
 * (target column's first) before reading the anchor — which destroyed the
 * anchor before we could read it, collapsing the "range" to just the target
 * column. Now we resolve the anchor first, then apply the full range in a
 * single select() call.
 *
 * Cursor placement: the selection store invariant is `cursor = walk-first`
 * of the resulting selection, so after a column-range select the cursor sits
 * on the first card of the leftmost column in the range. This is intentional
 * — the user can still see the selection extends rightward via the status
 * line and the highlighted card backgrounds.
 */
export function handleExtendSelectHorizontal(ctx: OpCtx, direction: "left" | "right"): void {
  const columnIds = ctx.tree.rootId ? ctx.tree.children(ctx.tree.rootId) : []

  if (columnIds.length === 0) return

  // Calculate target column (focus moves one step in direction)
  const targetColIdx =
    direction === "right" ? Math.min(columnIds.length - 1, ctx.colIndex + 1) : Math.max(0, ctx.colIndex - 1)

  // At boundary with existing selection: do nothing
  if (targetColIdx === ctx.colIndex && ctx.selectedIds.size > 0) return

  // Resolve the anchor BEFORE mutating selection. If no anchor exists yet
  // (no prior selection), the current column becomes the anchor — that's the
  // "start" of the range we're about to build.
  const anchorColIdx = resolveAnchorCol(ctx) ?? ctx.colIndex

  // Compute the full range (anchor → target) and apply it in one select().
  const newSelected = selectColumnRange(ctx, anchorColIdx, targetColIdx, columnIds)
  if (newSelected.size === 0) return
  const colCount = Math.abs(targetColIdx - anchorColIdx) + 1

  ctx.setSelection(nodesSelect(Array.from(newSelected)))
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
function selectColumnRange(ctx: OpCtx, fromCol: number, toCol: number, columnIds: readonly string[]): Set<string> {
  const selected = new Set<string>()
  const minCol = Math.min(fromCol, toCol)
  const maxCol = Math.max(fromCol, toCol)

  for (let colIdx = minCol; colIdx <= maxCol; colIdx++) {
    const colId = columnIds[colIdx]
    if (colId) {
      for (const cardId of ctx.tree.children(colId)) {
        selected.add(cardId)
      }
    }
  }
  return selected
}
