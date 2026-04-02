/**
 * Board Action Handlers - Edit Operations
 *
 * Handles node creation, deletion, status changes, and card shifting.
 *
 * ## Batch Operations Convention
 *
 * Every card operation is inherently batch-aware (single = batch of 1).
 * Each handler follows this structure:
 *
 * 1. GATHER — `Selection.nodes(ctx)` returns multi-selected or cursor card
 * 2. VALIDATE — all-or-nothing: if ANY card fails, NONE execute
 * 3. CONFIRM (optional) — set UI state, re-enter via separate action
 * 4. EXECUTE — perform mutations on all cards
 * 5. CLEANUP — operation-specific (see selection cleanup rules)
 *
 * Selection cleanup after batch:
 * - Cards destroyed → clearSelection (delete)
 * - Cards moved in tree → clearSelection (indent, outdent)
 * - Cards repositioned → rebuildSelection (move up/down/left/right)
 * - Cards modified in place → keep selection (status toggle)
 */

import { getMarkerForStatus, extractTaskDates, Position, type KNode, type TaskStatus } from "@km/core"
import { type ActionResult, boundary, ok } from "@km/commands"
import { getNextOccurrence } from "@km/storage"
import { Tree, midpoint } from "@km/tree"
import { moveCardInColumn, moveCardToColumn } from "../keyboard/keyboard-card-ops.ts"
import { clearSelection } from "../keyboard/keyboard-helpers.ts"
import { Selection } from "../selection.ts"
import type { ActionCtx } from "../tui-context.ts"
import type { ColumnView } from "../types.ts"

// Render flush flag — set by handleAddNodeAfter when a new InlineEditField
// needs to mount before the next event handler runs.
let _needsFlush = false

/** Consume and return the render flush flag. */
export function needsRenderFlush(): boolean {
  const result = _needsFlush
  _needsFlush = false
  return result
}

/** Request a synchronous render flush after the current event handler. */
export function requestRenderFlush(): void {
  _needsFlush = true
}

/**
 * Delete the selected node(s) — with confirmation for non-empty nodes.
 *
 * Handles three levels:
 * - Board level (cursor on board title): not allowed
 * - Column level (cursor on column header): always confirms (columns have cards)
 * - Card level: confirms if node has children, backlinks, or metadata
 *
 * Multi-select: deletes all selected cards. Shows confirmation if ANY node
 * has children/backlinks/metadata. All-or-nothing after confirmation.
 */
export function handleDeleteNode(ctx: ActionCtx): void {
  const { repo } = ctx
  const col = ctx.column
  const card = ctx.card

  if (!card && col) {
    // Column-level delete — confirmation only if non-empty
    handleDeleteColumn(ctx, col)
    return
  }

  if (!card) return // Board level — nothing to delete

  const cards = Selection.nodes(ctx)
  if (cards.length === 0) return

  // Aggregate impact across all cards
  // Empty children (no name/title/content) don't count — they're structural placeholders
  const TRIVIAL_DATA_KEYS = new Set(["rules", "lang", "meta", "completion"])
  let totalChildCount = 0
  let totalBacklinkCount = 0
  let anyHasMetadata = false

  for (const c of cards) {
    const children = repo.getChildren(c.id)
    totalChildCount += children.filter((ch) => ch.name || ch.title || ch.content).length
    totalBacklinkCount += repo.getRenameImpact(c.id).backlinks.length
    const significantKeys = c.data
      ? Object.keys(c.data).filter((k) => !k.startsWith("_") && !TRIVIAL_DATA_KEYS.has(k))
      : []
    if (significantKeys.length > 0) anyHasMetadata = true
  }

  if (totalChildCount > 0 || totalBacklinkCount > 0 || anyHasMetadata) {
    // Non-trivial: show confirmation dialog
    const firstCard = cards[0]
    if (!firstCard) return
    const title =
      cards.length > 1 ? `${cards.length} selected nodes` : (firstCard.name ?? firstCard.content ?? firstCard.id)
    ctx.setUI({
      deleteConfirm: {
        nodeIds: cards.map((c) => c.id),
        title,
        childCount: totalChildCount,
        backlinkCount: totalBacklinkCount,
        hasMetadata: anyHasMetadata,
      },
    })
    return
  }

  // All cards are empty: delete immediately
  executeBatchDelete(
    ctx,
    cards.map((c) => c.id),
  )
}

/**
 * Handle column deletion — skips confirmation if empty (no descendants, no backlinks).
 *
 * Counts all descendants recursively for the warning message.
 */
function handleDeleteColumn(
  ctx: ActionCtx,
  col: {
    node: { id: string; name?: string | null; content?: string | null; data?: Record<string, unknown> | null }
  },
): void {
  const { repo } = ctx
  const nodeId = col.node.id

  // Count non-empty descendants (cards + their children recursively).
  // Empty children (no name/title/content) are structural placeholders and don't count.
  // Cap at 10000 to avoid blocking the event loop on deep trees (118k+ nodes).
  const MAX_COUNT = 10000
  let totalDescendants = 0
  const countDescendants = (id: string) => {
    if (totalDescendants >= MAX_COUNT) return
    const children = repo.getChildren(id)
    for (const child of children) {
      if (totalDescendants >= MAX_COUNT) return
      if (child.name || child.title || child.content) totalDescendants++
      countDescendants(child.id)
    }
  }
  countDescendants(nodeId)

  const impact = repo.getRenameImpact(nodeId)

  if (totalDescendants === 0 && impact.backlinks.length === 0) {
    // Empty column: delete immediately without confirmation
    executeBatchDelete(ctx, [nodeId])
    return
  }

  ctx.setUI({
    deleteConfirm: {
      nodeIds: [nodeId],
      title: col.node.name ?? col.node.content ?? nodeId,
      childCount: totalDescendants,
      backlinkCount: impact.backlinks.length,
    },
  })
}

/**
 * Execute node deletion and adjust cursor position.
 *
 * Recursively deletes all descendants first (bottom-up), then the node itself.
 * Adjusts cursor: for card-level deletes, moves to adjacent card;
 * for column-level deletes, moves to adjacent column.
 */
export function executeDelete(ctx: ActionCtx, nodeId: string): void {
  executeBatchDelete(ctx, [nodeId])
}

/**
 * Execute batch deletion of multiple nodes and adjust cursor position.
 *
 * Deletes nodes bottom-up (highest index first) to avoid index invalidation.
 * Clears multi-selection after deletion.
 */
export function executeBatchDelete(ctx: ActionCtx, nodeIds: string[]): void {
  const { repo } = ctx
  const deleteSet = new Set(nodeIds)

  // Recursively delete all descendants bottom-up
  const deleteRecursive = (id: string) => {
    const children = repo.getChildren(id)
    for (const child of children) {
      deleteRecursive(child.id)
    }
    repo.deleteNode(id)
  }

  // Determine if we're deleting a column (direct child of root)
  const firstNode = repo.getNode(nodeIds[0] ?? "")
  const isDeletingColumn = firstNode?.parent_id === ctx.rootId

  // Pre-compute the cursor target: find next surviving sibling BEFORE deletion
  let cursorTarget: string | null = null
  if (isDeletingColumn) {
    // For column delete, find adjacent column not being deleted
    const columns = ctx.columns
    const colIdx = columns.findIndex((c) => deleteSet.has(c.node.id))
    // Try next column, then previous
    const nextCol = columns.slice(colIdx + 1).find((c) => !deleteSet.has(c.node.id))
    const prevCol = columns
      .slice(0, colIdx)
      .reverse()
      .find((c) => !deleteSet.has(c.node.id))
    const targetCol = nextCol ?? prevCol
    cursorTarget = targetCol?.cardNodes[0]?.id ?? targetCol?.node.id ?? null
  } else {
    // For card delete, find adjacent card in same column not being deleted
    const col = ctx.column
    if (col) {
      const cardIdx = col.cardNodes.findIndex((c) => deleteSet.has(c.id))
      const nextCard = col.cardNodes.slice(cardIdx + 1).find((c) => !deleteSet.has(c.id))
      const prevCard = col.cardNodes
        .slice(0, cardIdx)
        .reverse()
        .find((c) => !deleteSet.has(c.id))
      cursorTarget = (nextCard ?? prevCard)?.id ?? col.node.id
    }
  }

  // Batch all deletions into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Delete")

  // Delete bottom-up to avoid index invalidation
  for (const nodeId of [...nodeIds].reverse()) {
    deleteRecursive(nodeId)
  }

  ctx.undoHandle.endBatch()

  clearSelection(ctx)

  // Select the pre-computed cursor target
  if (cursorTarget) {
    ctx.dispatchBoard({ type: "SELECT", nodeId: cursorTarget })
  } else {
    // Fallback: re-select current cursor (may land on column header)
    ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
  }
}

/**
 * Create a new sibling node after the current card and enter inline edit on it.
 */
export function handleAddNodeAfter(ctx: ActionCtx): void {
  handleAddNode(ctx, "after")
}

/**
 * Create a new sibling node before the current card and enter inline edit on it.
 */
export function handleAddNodeBefore(ctx: ActionCtx): void {
  handleAddNode(ctx, "before")
}

/**
 * Create the first child node under the root on an empty board.
 * Node type depends on the root: heading root → list item (card),
 * file/folder root → heading (column).
 */
function handleAddFirstChild(ctx: ActionCtx): void {
  const { repo } = ctx
  if (!ctx.rootId) return

  const rootNode = repo.getNode(ctx.rootId)
  const rootIsHeading = rootNode?.type === "h"

  const newNode: Partial<KNode> = rootIsHeading
    ? { type: "p", item: {}, content: "", parent_idx: 0 }
    : { type: "h", item: {}, content: "", parent_idx: 0, fstype: "mdsection" }

  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  const newId = repo.addNode(ctx.rootId, newNode)
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
}

/**
 * Shared implementation: create sibling node before/after cursor and enter inline edit.
 *
 * Sort order is placed as midpoint between cursor and adjacent sibling.
 * Inherits node type from cursor node (task → task, section → section).
 */
function handleAddNode(ctx: ActionCtx, position: "before" | "after"): void {
  const { repo } = ctx
  const col = ctx.column
  if (!col) {
    // Empty board — create first child (heading) under root
    if (ctx.rootId) {
      handleAddFirstChild(ctx)
    }
    return
  }

  // Query repo for fresh children (columns may be stale after prior addNode)
  const siblings = repo.getChildren(col.node.id)
  const currentSibIdx = siblings.findIndex((s) => s.id === ctx.cursorNodeId)
  const currentNode = siblings[currentSibIdx]
  if (!currentNode) return

  // Sort order: midpoint between current and adjacent sibling
  const currentIdx = currentNode.parent_idx ?? 0
  const adjacentSibling = siblings[currentSibIdx + (position === "after" ? 1 : -1)]
  const adjacentIdx = adjacentSibling?.parent_idx ?? currentIdx + (position === "after" ? 1 : -1)
  const newSortOrder = midpoint(currentIdx, adjacentIdx)

  // Inherit type + depth from current node
  // Tasks (items with task_marker) create new tasks; outline items create new outline items
  const isCurrentTask = currentNode.item?.task?.marker !== undefined
  const newNode: Partial<KNode> = {
    type: isCurrentTask ? "p" : "h",
    item: isCurrentTask ? { list: currentNode.item?.list ?? "-", task: { marker: "[ ]", status: "todo" } } : {},
    content: "",
    parent_idx: newSortOrder,
  }
  if (!isCurrentTask) {
    newNode.fstype = "mdsection"
  }
  // No need to store depth in data — it's derived from tree position during serialization

  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  const newId = repo.addNode(col.node.id, newNode)

  // Select the newly created node directly by ID
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })

  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
}

/**
 * Create a new child node under the current card and enter inline edit on it.
 * (a-prefix chord: ai = add child item)
 */
export function handleAddNodeChild(ctx: ActionCtx): void {
  const { repo } = ctx
  const cursorId = ctx.cursorNodeId
  if (!cursorId) return

  const currentNode = repo.getNode(cursorId)
  if (!currentNode) return

  // Add as last child of current node
  const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(cursorId))

  const newNode: Partial<KNode> = {
    type: "h",
    item: {},
    content: "",
    parent_idx: newSortOrder,
    data: {},
  }

  ctx.undoHandle.setCursor(cursorId)
  const newId = repo.addNode(cursorId, newNode)

  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
}

/**
 * Create a new sibling of the current node's parent (uncle node) and enter inline edit.
 * (a-prefix chord: ah = add item at parent level)
 */
export function handleAddNodeAtParent(ctx: ActionCtx): void {
  const { repo } = ctx
  const cursorId = ctx.cursorNodeId
  if (!cursorId) return

  const currentNode = repo.getNode(cursorId)
  if (!currentNode?.parent_id) return

  const parentNode = repo.getNode(currentNode.parent_id)
  if (!parentNode?.parent_id) return

  // Add as sibling after the parent (i.e., under grandparent, after parent)
  const grandparentId = parentNode.parent_id
  const siblings = repo.getChildren(grandparentId)
  const parentSibIdx = siblings.findIndex((s) => s.id === parentNode.id)
  const parentIdx = parentNode.parent_idx ?? 0
  const nextSibling = siblings[parentSibIdx + 1]
  const nextIdx = nextSibling?.parent_idx ?? parentIdx + 1
  const newSortOrder = midpoint(parentIdx, nextIdx)

  // No need to store depth in data — it's derived from tree position during serialization
  const newNode: Partial<KNode> = {
    type: "h",
    item: {},
    content: "",
    parent_idx: newSortOrder,
    data: {},
  }

  ctx.undoHandle.setCursor(cursorId)
  const newId = repo.addNode(grandparentId, newNode)

  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
  ctx.setUI({ inlineEditBlock: { nodeId: newId, blockIndex: 0 } })
  requestRenderFlush()
}

/**
 * Duplicate a node: create a copy immediately after it with the same content and type.
 * Pushes an undo entry that deletes the new node.
 */
export function handleDuplicateNode(ctx: ActionCtx, nodeId: string): void {
  const { repo } = ctx
  const col = ctx.column
  if (!col) return

  const sourceNode = repo.getNode(nodeId)
  if (!sourceNode) return

  // Find position in siblings
  const siblings = repo.getChildren(col.node.id)
  const currentSibIdx = siblings.findIndex((s) => s.id === nodeId)
  if (currentSibIdx === -1) return

  const currentIdx = sourceNode.parent_idx ?? 0
  const nextSibling = siblings[currentSibIdx + 1]
  const nextIdx = nextSibling?.parent_idx ?? currentIdx + 1
  const newSortOrder = midpoint(currentIdx, nextIdx)

  const newNode: Partial<KNode> = {
    type: sourceNode.type,
    item: sourceNode.item ? { ...sourceNode.item } : undefined,
    content: sourceNode.content,
    parent_idx: newSortOrder,
    data: sourceNode.data ? { ...sourceNode.data } : undefined,
  }
  if (sourceNode.fstype) {
    newNode.fstype = sourceNode.fstype
  }

  const parentId = col.node.id
  // Auto-recorded by undoable repo — no manual undo entry needed
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  const newId = repo.addNode(parentId, newNode)

  // Select the duplicated node directly by ID
  ctx.dispatchBoard({ type: "SELECT", nodeId: newId })
}

/**
 * Confirm move operation - move selected nodes to target column.
 */
export function handleConfirmMove(ctx: ActionCtx): void {
  const { repo, dispatchBoard } = ctx
  const sourceNodeIds = ctx.moveState.active ? ctx.moveState.sourceNodes : []
  if (sourceNodeIds.length === 0) return
  const targetCol = ctx.column
  if (!targetCol) return

  // Batch all moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Move cards")

  let newSortOrder = Tree.toSortOrder(repo, Position.last(targetCol.node.id)).sortOrder
  for (const nodeId of sourceNodeIds) {
    repo.moveNode(nodeId, targetCol.node.id, newSortOrder)
    newSortOrder++
  }

  ctx.undoHandle.endBatch()
  dispatchBoard({ type: "CONFIRM_MOVE" })
  // Select the last moved node by ID
  const lastMovedId = sourceNodeIds[sourceNodeIds.length - 1]
  if (lastMovedId) {
    dispatchBoard({ type: "SELECT", nodeId: lastMovedId })
  }
}

/**
 * Cycle task status (todo → wip → blocked → done → dropped).
 *
 * Batch-aware: when multi-selection is active, cycles all selected cards.
 * Each card advances from its own current status independently.
 * Selection is preserved — status is an in-place modification.
 */
export function handleTaskStatusCycle(ctx: ActionCtx): void {
  const statusCycle: TaskStatus[] = ["todo", "wip", "blocked", "done", "dropped"]

  const count = Selection.forEach(ctx, "Toggle status", (c) => {
    const embedSource = c.embed_source
    const targetId = embedSource || c.id
    const targetNode = embedSource ? ctx.repo.getNode(embedSource) : c
    const currentStatus = targetNode?.item?.task?.status || "todo"
    const currentIndex = statusCycle.indexOf(currentStatus)
    const nextIndex = (currentIndex + 1) % statusCycle.length
    const nextStatus = statusCycle[nextIndex] ?? "todo"

    // Recurrence: when a recurring task transitions to "done", clone it with next due date
    const dueParts = targetNode ? extractTaskDates(targetNode).due : undefined
    if (nextStatus === "done" && targetNode?.rrule && dueParts?.date) {
      const nextDue = getNextOccurrence(targetNode.rrule, dueParts.date)
      // Mark current task done with completion timestamp
      ctx.repo.updateNode(targetId, {
        item: { task: { status: "done", marker: "[x]" } },
        completed_at: Date.now(),
      })
      if (nextDue) {
        // Clone task with next due date, reset to todo
        // Compose due_at from the next due date + existing time
        const nextDueAt = dueParts.time ? `${nextDue}T${dueParts.time}` : nextDue
        const parentId = targetNode.parent_id
        if (parentId) {
          ctx.repo.addNode(parentId, {
            type: targetNode.type,
            content: targetNode.content,
            item: { list: targetNode.item?.list, task: { marker: "[ ]", status: "todo" } },
            due_at: nextDueAt,
            start_at: targetNode.start_at,
            rrule: targetNode.rrule,
            priority: targetNode.priority,
            assigned_to: targetNode.assigned_to,
            recur_prev: targetId,
            parent_idx: (targetNode.parent_idx ?? 0) + 0.001,
            data: targetNode.data ? { ...targetNode.data } : undefined,
          })
        }
      }
    } else {
      ctx.repo.updateNode(targetId, {
        item: { ...targetNode?.item, task: { status: nextStatus, marker: getMarkerForStatus(nextStatus) } },
      })
    }
  })

  if (count === 0) return

  // Selection preserved: status toggle is in-place modification.
  // User can press x again to cycle all selected cards further.
  // Re-select current node to trigger UI update
  ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
}

/**
 * Clear all task properties from selected cards (status, dates, priority, assignee, recurrence).
 * Batch-aware: when multi-selection is active, clears all selected cards.
 */
export function handleClearTask(ctx: ActionCtx): void {
  const count = Selection.forEach(ctx, "Clear task", (c) => {
    const targetId = c.embed_source || c.id
    const targetNode = ctx.repo.getNode(targetId)
    ctx.repo.updateNode(targetId, {
      item: { ...targetNode?.item, task: undefined },
      due_at: undefined,
      start_at: undefined,
      priority: undefined,
      assigned_to: undefined,
      rrule: undefined,
      completed_at: undefined,
    })
  })

  if (count === 0) return
  ctx.dispatchBoard({ type: "SELECT", nodeId: ctx.cursorNodeId })
}

/**
 * Shift card or column in a direction.
 *
 * When cursor is on a card: up/down shifts within column, left/right moves between columns.
 * When cursor is on a column header: left/right reorders columns.
 */
export function handleShiftCard(ctx: ActionCtx, direction: "up" | "down" | "left" | "right"): ActionResult {
  const col = ctx.column
  const card = ctx.card

  if (!card) {
    // At column header level — reorder columns left/right
    // Virtual columns (body column) can't be moved
    if (col && !col.isVirtual && (direction === "left" || direction === "right")) {
      return moveColumn(ctx, col, direction)
    }
    return boundary(direction)
  }

  if (direction === "up" || direction === "down") {
    return moveCardInColumn(ctx, card, direction)
  } else {
    return moveCardToColumn(ctx, card, direction)
  }
}

/**
 * Reorder a column by swapping its sort order with the adjacent column.
 */
function moveColumn(
  ctx: ActionCtx,
  col: { node: { id: string; parent_idx: number } },
  direction: "left" | "right",
): ActionResult {
  if (!ctx.rootId) return boundary("move", "no root")
  const { repo } = ctx
  const columns = ctx.columns
  const colIndex = columns.findIndex((c) => c.node.id === col.node.id)
  const targetIndex = direction === "left" ? colIndex - 1 : colIndex + 1
  if (targetIndex < 0 || targetIndex >= columns.length) return boundary(direction)

  const targetCol = columns[targetIndex]
  if (!targetCol) return boundary(direction)

  // Virtual columns (e.g., __body__) are synthetic — can't be moved in the repo
  if (targetCol.isVirtual) return boundary(direction)

  // Batch all moves (normalize + swap) into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursorNodeId)
  ctx.undoHandle.startBatch("Move column")

  // Normalize sort orders for just the two columns being swapped (not all columns)
  normalizeColumnSortOrders(ctx, colIndex, targetIndex)

  // Swap sort orders by moving each column to the other's position
  const parentId = ctx.rootId
  // Read parent_idx from repo (not layout) to avoid stale references
  const curNode = repo.getNode(col.node.id)
  const targetNode = repo.getNode(targetCol.node.id)
  const curOrder = curNode?.parent_idx ?? col.node.parent_idx
  const targetOrder = targetNode?.parent_idx ?? targetCol.node.parent_idx
  repo.moveNode(col.node.id, parentId, targetOrder)
  repo.moveNode(targetCol.node.id, parentId, curOrder)

  ctx.undoHandle.endBatch()

  // Column moved — re-select by node ID (column header)
  ctx.dispatchBoard({ type: "SELECT", nodeId: col.node.id })
  return ok()
}

/**
 * Ensure the two columns involved in a swap have distinct parent_idx values.
 * When siblings share parent_idx (e.g., all 0 from import), swapping equal
 * values is a no-op. Instead of normalizing ALL columns (which triggers N
 * disk writes and watcher events), only assign distinct indices to the two
 * columns being swapped.
 */
function normalizeColumnSortOrders(ctx: ActionCtx, colIndexA: number, colIndexB: number): void {
  const { repo } = ctx
  const colA = ctx.columns[colIndexA]
  const colB = ctx.columns[colIndexB]
  if (!colA || !colB) return

  // Only normalize if the two columns share the same parent_idx
  if (colA.node.parent_idx !== colB.node.parent_idx) return

  // Assign distinct indices based on the shared parent_idx value, not array position.
  // Array indices include virtual columns (e.g., __body__ at index 0), so using them
  // as parent_idx values would produce wrong offsets.
  const parentId = ctx.rootId
  if (!parentId) return
  const base = colA.node.parent_idx
  // Both columns share `base` — only the right one needs to change to `base + 1`.
  const rightCol = colIndexA < colIndexB ? colB : colA
  if (!rightCol.isVirtual) {
    repo.moveNode(rightCol.node.id, parentId, base + 1)
    rightCol.node.parent_idx = base + 1
  }
}

/**
 * Indent a column: reparent it as the last card of the previous column.
 *
 * The column becomes a child of the previous column. Cursor moves to
 * the previous column to follow the indented content.
 */
export function handleIndentColumn(ctx: ActionCtx, col: ColumnView): ActionResult {
  const { repo } = ctx
  const columns = ctx.columns
  const colIndex = columns.findIndex((c) => c.node.id === col.node.id)

  // Need a previous column to indent into
  if (colIndex <= 0) return boundary("indent", "First column can't be indented")

  const prevCol = columns[colIndex - 1]
  if (!prevCol) return boundary("indent", "No previous column")

  // Calculate sort order: after last card in target column
  const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(prevCol.node.id))

  // Record cursor for undo
  ctx.undoHandle.setCursor(ctx.cursorNodeId)

  // Move the column node under the previous column
  repo.moveNode(col.node.id, prevCol.node.id, newSortOrder)

  // The indented column is now a card under prevCol — select it by node ID
  ctx.dispatchBoard({ type: "SELECT", nodeId: col.node.id })

  return ok()
}
