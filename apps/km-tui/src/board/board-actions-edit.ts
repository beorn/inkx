/**
 * Board Action Handlers - Edit Operations
 *
 * Handles node creation, deletion, status changes, and card shifting.
 */

import type { KNode, TaskMark, TaskStatus } from "@km/core"
import { moveCardInColumn, moveCardToColumn } from "../keyboard/keyboard-card-ops.ts"
import { refreshBoardState } from "../keyboard/keyboard-helpers.ts"
import type { ActionCtx } from "../tui-context.ts"

// Render flush flag — set by handleAddNodeAfter when a new InlineEditField
// needs to mount before the next event handler runs.
let _needsFlush = false

/** Consume and return the render flush flag. */
export function needsRenderFlush(): boolean {
  const result = _needsFlush
  _needsFlush = false
  return result
}

/**
 * Delete the selected node — with confirmation for non-empty nodes.
 *
 * If the node has children or backlinks, shows a confirmation dialog
 * listing what will be deleted/broken. Otherwise deletes immediately.
 */
export function handleDeleteNode(ctx: ActionCtx): void {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) return

  const nodeId = card.node.id
  const children = repo.getChildren(nodeId)
  const impact = repo.getRenameImpact(nodeId)
  const childCount = children.length
  const backlinkCount = impact.backlinks.length
  // Filter out internal/computed metadata keys — only user-authored frontmatter counts
  const TRIVIAL_DATA_KEYS = new Set(["depth", "rules", "lang", "meta", "completion"])
  const significantKeys = card.node.data
    ? Object.keys(card.node.data).filter((k) => !k.startsWith("_") && !TRIVIAL_DATA_KEYS.has(k))
    : []
  const hasMetadata = significantKeys.length > 0

  if (childCount > 0 || backlinkCount > 0 || hasMetadata) {
    // Non-trivial node: show confirmation dialog
    ctx.setUI({
      deleteConfirm: {
        nodeId,
        title: card.node.name ?? card.node.content ?? nodeId,
        childCount,
        backlinkCount,
        hasMetadata: !!hasMetadata,
      },
    })
    return
  }

  // Empty node with no children/backlinks/metadata: delete immediately
  executeDelete(ctx, nodeId)
}

/**
 * Execute node deletion and adjust cursor position.
 */
export function executeDelete(ctx: ActionCtx, nodeId: string): void {
  const { layout } = ctx
  ctx.repo.deleteNode(nodeId)
  refreshBoardState(ctx, {
    cardIndex: (c) => Math.min(layout.cardIndex, Math.max(0, (c?.cards.length ?? 1) - 1)),
  })
}

/**
 * Create a new sibling node after the current card and enter inline edit on it.
 *
 * The new node inherits the type of the current node (task → task, section → section).
 * Sort order is placed between current and next sibling (midpoint).
 */
export function handleAddNodeAfter(ctx: ActionCtx): void {
  const { layout, repo } = ctx
  const col = layout.columns[layout.colIndex]
  if (!col) return

  // Query repo for fresh children (layout.columns.cards may be stale after prior addNode)
  const siblings = repo.getChildren(col.node.id)
  const currentNodeId = ctx.cursorNodeId

  // Find current node's position in fresh sibling list
  const currentSibIdx = siblings.findIndex((s) => s.id === currentNodeId)
  const currentNode = siblings[currentSibIdx]
  if (!currentNode) return

  // Sort order: midpoint between current and next sibling
  const currentIdx = currentNode.parent_idx ?? 0
  const nextSibling = siblings[currentSibIdx + 1]
  const nextIdx = nextSibling?.parent_idx ?? currentIdx + 1
  const newSortOrder = (currentIdx + nextIdx) / 2

  // Inherit type + depth from current node
  const nodeType = currentNode.type === "task" ? "task" : "section"
  const newNode: Partial<KNode> = {
    type: nodeType,
    content: "",
    parent_idx: newSortOrder,
  }
  if (nodeType === "task") {
    newNode.task_status = "todo"
    newNode.task_mark = " "
  }
  if (currentNode.data?.depth) {
    newNode.data = { ...newNode.data, depth: currentNode.data.depth }
  }

  const newId = repo.addNode(col.node.id, newNode)

  // Refresh board state with fresh repo query.
  // usePositionHints: new node isn't in nodeIndex yet (only rebuilt on render).
  refreshBoardState(ctx, {
    cardIndex: currentSibIdx + 1,
    usePositionHints: true,
  })

  // Enter inline edit on the new node
  ctx.setUI({
    inlineEditBlock: { nodeId: newId, blockIndex: 0 },
  })

  // Signal that a render flush is needed (new component must mount before next event)
  _needsFlush = true
}

/**
 * Confirm move operation - move selected nodes to target column.
 */
export function handleConfirmMove(ctx: ActionCtx): void {
  const { layout, repo, dispatchBoard } = ctx
  const sourceNodeIds = ctx.moveSourceNodes
  if (sourceNodeIds.length === 0) return
  const targetCol = layout.columns[layout.colIndex]
  if (!targetCol) return
  let newSortOrder =
    targetCol.cards.length > 0 ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) + 1 : 0
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
export function handleTaskStatusCycle(ctx: ActionCtx): void {
  const { layout } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) return
  const targetId = card.node.link_to || card.node.id
  const targetNode = card.node.link_to ? ctx.repo.getNode(card.node.link_to) : card.node
  const currentStatus = targetNode?.task_status || "todo"
  const statusCycle: TaskStatus[] = ["todo", "wip", "blocked", "done", "dropped"]
  const currentIndex = statusCycle.indexOf(currentStatus)
  const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length] as TaskStatus
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
 * Shift card or column in a direction.
 *
 * When cursor is on a card: up/down shifts within column, left/right moves between columns.
 * When cursor is on a column header: left/right reorders columns.
 */
export function handleShiftCard(ctx: ActionCtx, direction: "up" | "down" | "left" | "right"): void {
  const { layout } = ctx
  const col = layout.columns[layout.colIndex]
  const card = col?.cards[layout.cardIndex]

  if (!card) {
    // At column header level — reorder columns left/right
    if (col && (direction === "left" || direction === "right")) {
      moveColumn(ctx, col, direction)
    }
    return
  }

  if (direction === "up" || direction === "down") {
    moveCardInColumn(ctx, card, direction)
  } else {
    moveCardToColumn(ctx, card, direction)
  }
}

/**
 * Reorder a column by swapping its sort order with the adjacent column.
 */
function moveColumn(
  ctx: ActionCtx,
  col: { node: { id: string; parent_idx: number } },
  direction: "left" | "right",
): void {
  const { layout, repo } = ctx
  const targetIndex = direction === "left" ? layout.colIndex - 1 : layout.colIndex + 1
  if (targetIndex < 0 || targetIndex >= layout.columns.length) return

  const targetCol = layout.columns[targetIndex]
  if (!targetCol) return

  // Normalize column sort orders when duplicates exist (e.g., all default to 0)
  normalizeColumnSortOrders(ctx)

  // Swap sort orders by moving each column to the other's position
  const parentId = ctx.rootId
  const curOrder = col.node.parent_idx
  const targetOrder = targetCol.node.parent_idx
  repo.moveNode(col.node.id, parentId, targetOrder)
  repo.moveNode(targetCol.node.id, parentId, curOrder)

  refreshBoardState(ctx, { colIndex: targetIndex })
}

/**
 * Ensure all columns have distinct parent_idx values.
 * Same problem as cards: when siblings share parent_idx (e.g., all 0),
 * swapping equal values is a no-op.
 */
function normalizeColumnSortOrders(ctx: ActionCtx): void {
  const { layout, repo } = ctx
  const seen = new Set<number>()
  let hasDuplicates = false
  for (const c of layout.columns) {
    if (seen.has(c.node.parent_idx)) {
      hasDuplicates = true
      break
    }
    seen.add(c.node.parent_idx)
  }
  if (!hasDuplicates) return

  const parentId = ctx.rootId
  for (let i = 0; i < layout.columns.length; i++) {
    const c = layout.columns[i]
    if (c && c.node.parent_idx !== i) {
      repo.moveNode(c.node.id, parentId, i)
      c.node.parent_idx = i
    }
  }
}
