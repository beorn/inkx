/**
 * Board Action Handlers - Edit Operations
 *
 * Handles node deletion, status changes, and card shifting.
 */

import type { TaskMark, TaskStatus } from "@km/core"
import { moveCardInColumn, moveCardToColumn } from "./keyboard-card-ops.ts"
import { refreshBoardState } from "./keyboard-helpers.ts"
import type { TUIContext } from "./tui-context.ts"

/**
 * Delete the selected node.
 */
export function handleDeleteNode(ctx: TUIContext): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return
  ctx.repo.deleteNode(card.node.id)
  refreshBoardState(ctx, {
    cardIndex: (c) =>
      Math.min(state.cardIndex, Math.max(0, (c?.cards.length ?? 1) - 1)),
  })
}

/**
 * Confirm move operation - move selected nodes to target column.
 */
export function handleConfirmMove(ctx: TUIContext): void {
  const { boardState, layout, repo, dispatchBoard } = ctx
  const sourceNodeIds = boardState.moveSourceNodes
  if (sourceNodeIds.length === 0) return
  const targetCol = layout.columns[layout.colIndex]
  if (!targetCol) return
  let newSortOrder =
    targetCol.cards.length > 0
      ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1
      : 0
  for (const nodeId of sourceNodeIds) {
    repo.moveNode(nodeId, targetCol.node.id, newSortOrder)
    newSortOrder++
  }
  dispatchBoard({ type: "CONFIRM_MOVE" })
  refreshBoardState(ctx, {
    colIndex: layout.colIndex,
    cardIndex: () => targetCol.cards.length,
  })
}

/**
 * Cycle task status (todo → wip → blocked → done → dropped).
 */
export function handleTaskStatusCycle(ctx: TUIContext): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return
  const targetId = card.node.link_to || card.node.id
  const targetNode = card.node.link_to
    ? ctx.repo.getNode(card.node.link_to)
    : card.node
  const currentStatus = targetNode?.task_status || "todo"
  const statusCycle: TaskStatus[] = [
    "todo",
    "wip",
    "blocked",
    "done",
    "dropped",
  ]
  const currentIndex = statusCycle.indexOf(currentStatus)
  const nextStatus = statusCycle[
    (currentIndex + 1) % statusCycle.length
  ] as TaskStatus
  const markMap: Record<TaskStatus, TaskMark> = {
    todo: " ",
    wip: "/",
    blocked: "!",
    done: "x",
    dropped: "-",
  }
  ctx.repo.updateNode(targetId, {
    task_status: nextStatus,
    task_mark: markMap[nextStatus],
  })
  refreshBoardState(ctx)
}

/**
 * Shift card in a direction (up/down within column, left/right between columns).
 */
export function handleShiftCard(
  ctx: TUIContext,
  direction: "up" | "down" | "left" | "right",
): void {
  const { state } = ctx
  const col = state.columns[state.colIndex]
  const card = col?.cards[state.cardIndex]

  if (!card) return

  if (direction === "up" || direction === "down") {
    moveCardInColumn(ctx, card, direction)
  } else {
    moveCardToColumn(ctx, card, direction)
  }
}
