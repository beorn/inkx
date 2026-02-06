/**
 * Board Action Handlers - Zoom Operations
 *
 * Handles zoom in/out and related navigation between board levels.
 */

import type { ActionResult } from "@km/commands"
import { boundary, ok, precondition } from "@km/commands"
import type { KNode } from "@km/core"
import { handleCursorMove } from "./board-actions-nav.ts"
import {
  clearSelection,
  pushNavHistoryEntry,
} from "../keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "../tui-context.ts"
import { actions } from "../ui-reducer.ts"

/**
 * Zoom out to parent level.
 * Handles detail pane, outline mode, and actual zoom operations.
 */
export function handleZoomOutwards(ctx: ActionCtx): ActionResult {
  const { boardState, ui, layout, dispatchUI, dispatchBoard } = ctx

  // Close overlays first
  if (ui.showDetailPane) {
    dispatchUI(actions.setDetailPane(false))
    return ok()
  }
  if (ui.inOutlineMode) {
    dispatchUI(actions.exitOutlineMode())
    dispatchUI(actions.setSubIndex(0))
    clearSelection(ctx)
    return ok()
  }

  // Try actual zoom out (to parent of current root)
  if (boardState.rootId) {
    const currentRoot = ctx.repo.getNode(boardState.rootId)

    // Check if we're at repo root (parent_id is null)
    if (!currentRoot || currentRoot.parent_id === null) {
      // Can't zoom out from repo root
      return boundary("zoom_out", "at repo root")
    }

    // We have a parent - zoom out to it
    const parentNode = ctx.repo.getNode(currentRoot.parent_id)
    if (parentNode) {
      pushNavHistoryEntry(
        dispatchUI,
        boardState.rootId,
        layout.colIndex,
        layout.cardIndex,
        ui.subIndex,
        ui.multiSelected,
        ui.inOutlineMode,
        boardState.cursorNodeId,
        ctx.boardState.foldedNodes,
      )

      // When zooming out, keep the current root as the cursor
      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: parentNode.id,
        cursorNodeId: boardState.rootId,
      })
      clearSelection(ctx)
      return ok()
    }
  }

  // Can't zoom out - delegate to cursor up for card→column→board navigation
  // This ensures 'u' and 'k' use the same boundary checking logic
  return handleCursorMove(ctx, "up")
}

/**
 * Zoom into the selected card.
 */
export function handleZoomIn(ctx: ActionCtx): ActionResult {
  const { boardState, ui, dispatchUI, dispatchBoard, layout } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  // Support zoom at both card and column level
  const nodeId = card?.node.id ?? col?.node.id
  if (!nodeId) return precondition("card")

  // If node has no children, return boundary (nothing to zoom into)
  const children = ctx.repo.getChildren(nodeId)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
  pushNavHistoryEntry(
    dispatchUI,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    boardState.cursorNodeId,
    ctx.boardState.foldedNodes,
  )

  // Dispatch zoom to the node, with first child as initial cursor
  const firstChild = children[0]
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId,
    cursorNodeId: firstChild?.id ?? null,
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Zoom into a specific node by ID (works for both cards and columns)
 */
export function handleZoomInNode(ctx: ActionCtx, nodeId: string): ActionResult {
  const { boardState, ui, dispatchUI, dispatchBoard, layout } = ctx

  // Verify node has children
  const children = ctx.repo.getChildren(nodeId)
  if (children.length === 0) {
    return boundary("in", "no children")
  }

  // Save current state to history
  pushNavHistoryEntry(
    dispatchUI,
    boardState.rootId,
    layout.colIndex,
    layout.cardIndex,
    ui.subIndex,
    ui.multiSelected,
    ui.inOutlineMode,
    boardState.cursorNodeId,
    ctx.boardState.foldedNodes,
  )

  // Dispatch zoom with first child as initial cursor
  const firstChild = children[0]
  dispatchBoard({
    type: "ZOOM_IN",
    nodeId,
    cursorNodeId: firstChild?.id ?? null,
  })

  clearSelection(ctx)
  return ok()
}

/**
 * Zoom inwards - handles outline mode sub-selection or standard zoom.
 */
export function handleZoomInwards(ctx: ActionCtx): ActionResult {
  const { boardState, ui, dispatchUI, dispatchBoard, layout } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  // If at column level (no card selected), zoom into the column directly
  if (!card) {
    if (!col) return precondition("card")
    return handleZoomInNode(ctx, col.node.id)
  }

  // If we're in outline mode with a sub-selection, zoom to that child
  if (ui.inOutlineMode && ui.subIndex > 0) {
    const flatChildren: { node: KNode; depth: number }[] = []

    // Build flat list of visible descendants
    function collectVisible(
      nodeId: string,
      depth: number,
      maxDepth: number,
    ): void {
      if (depth > maxDepth) return
      const nodeChildren = ctx.repo.getChildren(nodeId)
      for (const child of nodeChildren) {
        flatChildren.push({ node: child, depth })
        if (!ctx.boardState.foldedNodes.has(child.id)) {
          collectVisible(child.id, depth + 1, maxDepth)
        }
      }
    }

    collectVisible(card.node.id, 1, ui.maxOutlineDepth)

    const targetChild = flatChildren[ui.subIndex - 1]
    if (targetChild?.node) {
      // Save state and zoom to child
      pushNavHistoryEntry(
        dispatchUI,
        boardState.rootId,
        layout.colIndex,
        layout.cardIndex,
        ui.subIndex,
        ui.multiSelected,
        ui.inOutlineMode,
        boardState.cursorNodeId,
        ctx.boardState.foldedNodes,
      )

      dispatchUI(actions.exitOutlineMode())
      dispatchUI(actions.setSubIndex(0))

      // Get first child of zoom target for cursor initialization
      const targetChildChildren = ctx.repo.getChildren(targetChild.node.id)
      const firstChild = targetChildChildren[0]

      dispatchBoard({
        type: "ZOOM_IN",
        nodeId: targetChild.node.id,
        cursorNodeId: firstChild?.id ?? null,
      })

      clearSelection(ctx)
      return ok()
    }
  }

  // Zoom one level inward toward the cursor node.
  // Walk up from cursor to find the child of root on the path.
  const cursorId = card.node.id
  const rootId = boardState.rootId

  // Find the child of current root that is an ancestor of (or is) the cursor
  let target = cursorId
  let node = ctx.repo.getNode(target)
  while (node && node.parent_id && node.parent_id !== rootId) {
    target = node.parent_id
    node = ctx.repo.getNode(target)
  }

  if (!node) {
    // Cursor isn't a descendant of root — shouldn't happen, fall back
    return handleZoomIn(ctx)
  }

  // target is now the child of root on the path to cursor
  return handleZoomInNode(ctx, target)
}
