/**
 * Board Action Handlers - Selection Operations
 *
 * Handles multi-selection, range selection, and selection clearing.
 */

import { updateSelectionRange } from "./keyboard-helpers.ts"
import {
  handleTreeNavigation,
  type TreeDirection,
} from "./navigation-handlers.ts"
import type { TUIContext } from "./tui-context.ts"
import { makeSelectionKey } from "./types.ts"
import { actions } from "./ui-reducer.ts"

/**
 * Extend selection vertically (up or down).
 */
export function handleExtendSelectVertical(
  ctx: TUIContext,
  direction: "up" | "down",
): void {
  const { state, ui, dispatch, dispatchBoard } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card || !col) return

  // Initialize selection if starting fresh
  if (ui.multiSelected.size === 0) {
    dispatch(
      actions.setSelectionAnchor({
        col: state.colIndex,
        card: state.cardIndex,
        sub: 0,
      }),
    )
    const newSelected = new Set(ui.multiSelected)
    newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, 0))
    dispatch(actions.setMultiSelected(newSelected))
    dispatch(
      actions.setStatus({
        level: "info",
        message: "1 item selected",
      }),
    )
  }

  // Calculate target
  const targetIdx =
    direction === "up"
      ? Math.max(0, state.cardIndex - 1)
      : Math.min(col.cards.length - 1, state.cardIndex + 1)

  if (targetIdx === state.cardIndex) return

  // Move cursor
  const treeDir = direction === "up" ? "prev" : "next"
  const targetId = handleTreeNavigation(
    treeDir as TreeDirection,
    ctx.boardState,
    ctx.repo,
  )
  if (targetId) {
    dispatchBoard({ type: "SELECT", nodeId: targetId })
    // Update selection range (will also set status)
    updateSelectionRange(ctx, state.colIndex, targetIdx, 0)
  }
}

/**
 * Extend selection horizontally (left or right).
 * Currently just clears selection - horizontal range selection not yet implemented.
 */
export function handleExtendSelectHorizontal(
  ctx: TUIContext,
  _direction: "left" | "right",
): void {
  const { ui, dispatch } = ctx

  // Clear selection only (TODO: horizontal extend-select doesn't support range selection)
  if (ui.multiSelected.size > 0) {
    dispatch(actions.clearMultiSelection())
    dispatch(actions.setSelectionAnchor(null))
    dispatch(actions.clearStatus())
  }
}
