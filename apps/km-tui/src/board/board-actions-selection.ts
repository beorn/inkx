/**
 * Board Action Handlers - Selection Operations
 *
 * Handles multi-selection, range selection, and selection clearing.
 */

import { updateSelectionRange } from "../keyboard/keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "../handlers/navigation-handlers.ts"
import type { ActionCtx } from "../tui-context.ts"
import { makeSelectionKey } from "../types.ts"

/**
 * Extend selection vertically (up or down).
 */
export function handleExtendSelectVertical(
  ctx: ActionCtx,
  direction: "up" | "down",
): void {
  const { layout, ui, dispatchBoard } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card || !col) return

  // Initialize selection if starting fresh
  if (ui.multiSelected.size === 0) {
    const newSelected = new Set(ui.multiSelected)
    newSelected.add(makeSelectionKey(layout.colIndex, layout.cardIndex, 0))
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

  // Move cursor
  const treeDir = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(
    treeDir as TreeDirection,
    ctx,
    ctx.repo,
  )
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    // Update selection range (will also set status)
    updateSelectionRange(ctx, layout.colIndex, targetIdx, 0)
  }
}

/**
 * Extend selection horizontally (left or right).
 * Currently just clears selection - horizontal range selection not yet implemented.
 */
export function handleExtendSelectHorizontal(
  ctx: ActionCtx,
  _direction: "left" | "right",
): void {
  const { ui } = ctx

  // Clear selection only (TODO: horizontal extend-select doesn't support range selection)
  if (ui.multiSelected.size > 0) {
    ctx.setUI({ multiSelected: new Set(), selectionAnchor: null, status: null })
  }
}
