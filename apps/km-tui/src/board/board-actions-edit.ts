/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
 * 1. GATHER — `getSelectedNodes(ctx)` returns multi-selected or cursor card
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
import type { ID } from "@silvery/selection"
import { type OpResult, boundary, ok } from "@km/commands"
import { getNextOccurrence } from "@km/storage"
import { Tree, midpoint } from "@km/tree"
import { moveCardInColumn, moveCardToColumn } from "../keyboard/keyboard-card-ops.ts"
import { clearSelection, getSelectedNodes, forEachSelected } from "./board-selection-helpers.ts"
import type { OpCtx } from "../tui-context.ts"
import { runRepoEffect } from "./board-effect-runner.ts"
import { captureTree } from "../state/capture-tree.ts"
import { nodeSelect, textCaret } from "../state/selection.ts"
import { isTeaDeleteConfirmEnabled, getDeleteConfirmStore } from "../plugins/with-delete-confirm.ts"

/**
 * Find the nearest surviving node to `target` in the new tree.
 *
 * Strategy: scan forward in nextOrder from the target's approximate position,
 * then backward. Skips structural ancestors (parent/column) in favor of
 * siblings at a comparable walk-order position. This matches user expectation
 * after delete: cursor goes to next sibling, then previous, then parent.
 */
function findNearestSurvivor(target: ID, prevOrder: readonly ID[], nextOrder: readonly ID[]): ID | null {
  if (nextOrder.length === 0) return null
  const targetIdx = prevOrder.indexOf(target)
  if (targetIdx === -1) return nextOrder[0] ?? null

  // Build a mapping from nextOrder IDs to their position in prevOrder
  // so we can find the insertion point of 'target' in nextOrder.
  const prevIdxOf = new Map<ID, number>()
  for (let i = 0; i < prevOrder.length; i++) prevIdxOf.set(prevOrder[i]!, i)

  // Find where target would sit in nextOrder (by prev walk position)
  let insertionPoint = 0
  for (let i = 0; i < nextOrder.length; i++) {
    const pi = prevIdxOf.get(nextOrder[i]!)
    if (pi !== undefined && pi < targetIdx) insertionPoint = i + 1
  }

  // Scan forward from insertion point, then backward
  if (insertionPoint < nextOrder.length) return nextOrder[insertionPoint]!
  if (insertionPoint > 0) return nextOrder[insertionPoint - 1]!
  return nextOrder[0] ?? null
}

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
export function handleDeleteNode(ctx: OpCtx): void {
  const { repo } = ctx
  const card = ctx.card

  if (!card && ctx.columnId) {
    // Column-level delete — confirmation only if non-empty
    const colNode = repo.getNode(ctx.columnId)
    if (colNode) handleDeleteColumn(ctx, { node: colNode })
    return
  }

  if (!card) return // Board level — nothing to delete

  const cards = getSelectedNodes(ctx)
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
    const payload = {
      nodeIds: cards.map((c) => c.id),
      title,
      childCount: totalChildCount,
      backlinkCount: totalBacklinkCount,
      hasMetadata: anyHasMetadata,
    }
    ctx.setUI({ deleteConfirm: payload })
    // Phase 1 cutover: dual-write show to plugin store.
    if (isTeaDeleteConfirmEnabled()) {
      getDeleteConfirmStore().dispatch({ type: "deleteConfirm.show", payload })
    }
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
  ctx: OpCtx,
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

  const payload = {
    nodeIds: [nodeId],
    title: col.node.name ?? col.node.content ?? nodeId,
    childCount: totalDescendants,
    backlinkCount: impact.backlinks.length,
  }
  ctx.setUI({ deleteConfirm: payload })
  // Phase 1 cutover: dual-write show to plugin store.
  if (isTeaDeleteConfirmEnabled()) {
    getDeleteConfirmStore().dispatch({ type: "deleteConfirm.show", payload })
  }
}

/**
 * Execute node deletion and adjust cursor position.
 *
 * Recursively deletes all descendants first (bottom-up), then the node itself.
 * Adjusts cursor: for card-level deletes, moves to adjacent card;
 * for column-level deletes, moves to adjacent column.
 */
export function executeDelete(ctx: OpCtx, nodeId: string): void {
  executeBatchDelete(ctx, [nodeId])
}

/**
 * Execute batch deletion of multiple nodes and adjust cursor position.
 *
 * Deletes nodes bottom-up (highest index first) to avoid index invalidation.
 * Uses sel.transform() for atomic cursor repair — no manual cursor computation.
 */
export function executeBatchDelete(ctx: OpCtx, nodeIds: string[]): void {
  const { repo } = ctx

  // Recursively delete all descendants bottom-up
  const deleteRecursive = (id: string) => {
    const children = repo.getChildren(id)
    for (const child of children) {
      deleteRecursive(child.id)
    }
    repo.deleteNode(id)
  }

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(repo, selRoot)

  // Batch all deletions into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Delete")

  // Delete bottom-up to avoid index invalidation
  for (const nodeId of [...nodeIds].reverse()) {
    deleteRecursive(nodeId)
  }

  ctx.undoHandle.endBatch()

  // Snapshot tree AFTER mutations
  const nextTree = captureTree(repo, selRoot)

  // Atomic selection repair: transform handles cursor/anchor repair,
  // multi-selection survivors, and sub-selection cleanup.
  // Must run BEFORE clearSelection — transform needs the full multi-selection
  // to find surviving nodes for cursor repair.
  const prevCursor = ctx.sel.node.cursor()
  for (const nodeId of nodeIds) {
    ctx.sel.transform({ type: "deleteNode", id: nodeId as ID }, prevTree, nextTree)
  }

  // Cursor repair after delete. Two cases fall through transformSelection:
  //
  //   1. All selected nodes were deleted ⇒ transform leaves cursor=null.
  //   2. ctx.cursor (the node the user sees the caret on, derived from the
  //      visible lens) is one of the deleted ids but sel.cursor is a
  //      different node (column/ancestor) that survived. transformDelete
  //      returns the selection unchanged because `deletedId` is not in
  //      sel.ids — which means sel.cursor sticks on an ancestor the user
  //      was NOT on, producing the "cursor jumped to column header after
  //      delete" symptom.
  //
  // In both cases, use the walk-order survivor of ctx.cursor (what the
  // user actually sees) as the target.
  const liveCursor = ctx.sel.node.cursor()
  const cursorLost = liveCursor === null
  const cursorReferent = (ctx.cursor ?? prevCursor) as ID | null
  const deletedSet = new Set(nodeIds as ID[])
  const cursorStaleToDeletion =
    cursorReferent !== null && deletedSet.has(cursorReferent) && liveCursor !== cursorReferent
  if ((cursorLost || cursorStaleToDeletion) && cursorReferent !== null) {
    const prevOrder = prevTree.walkOrder(selRoot)
    const nextOrder = nextTree.walkOrder(selRoot)
    const nearestId = findNearestSurvivor(cursorReferent, prevOrder, nextOrder)
    if (nearestId !== null) {
      ctx.setSelection(nodeSelect(nearestId))
    }
  }

  clearSelection(ctx)
}

/**
 * Create a new sibling node after the current card and enter inline edit on it.
 */
export function handleAddNodeAfter(ctx: OpCtx): void {
  handleAddNode(ctx, "after")
}

/**
 * Create a new sibling node before the current card and enter inline edit on it.
 */
export function handleAddNodeBefore(ctx: OpCtx): void {
  handleAddNode(ctx, "before")
}

/**
 * Create the first child node under the root on an empty board.
 * Node type depends on the root: heading root → list item (card),
 * file/folder root → heading (column).
 */
function handleAddFirstChild(ctx: OpCtx): void {
  const { repo } = ctx
  if (!ctx.rootId) return

  const rootNode = repo.getNode(ctx.rootId)
  const rootIsHeading = rootNode?.type === "h"

  const newNode: Partial<KNode> = rootIsHeading
    ? { type: "p", item: {}, content: "", parent_idx: 0 }
    : { type: "h", item: {}, content: "", parent_idx: 0, fstype: "mdsection" }

  ctx.undoHandle.setCursor(ctx.cursor)
  const newId = repo.addNode(ctx.rootId, newNode)
  ctx.setSelection(textCaret(newId, 0))
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/**
 * Shared implementation: create sibling node before/after cursor and enter inline edit.
 *
 * Sort order is placed as midpoint between cursor and adjacent sibling.
 * Inherits node type from cursor node (task → task, section → section).
 */
function handleAddNode(ctx: OpCtx, position: "before" | "after"): void {
  const { repo } = ctx
  if (!ctx.columnId) {
    // Empty board — create first child (heading) under root
    if (ctx.rootId) {
      handleAddFirstChild(ctx)
    }
    return
  }

  // Query repo for fresh children (columns may be stale after prior addNode)
  const siblings = repo.getChildren(ctx.columnId)
  const currentSibIdx = siblings.findIndex((s) => s.id === (ctx.cursor as string))
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

  ctx.undoHandle.setCursor(ctx.cursor)
  const newId = repo.addNode(ctx.columnId!, newNode)

  ctx.setSelection(textCaret(newId, 0))
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/**
 * Create a new child node under the current card and enter inline edit on it.
 * (a-prefix chord: ai = add child item)
 */
export function handleAddNodeChild(ctx: OpCtx): void {
  const { repo } = ctx
  const cursorId = ctx.cursor
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
  ctx.setSelection(textCaret(newId, 0))
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/**
 * Create a new sibling of the current node's parent (uncle node) and enter inline edit.
 * (a-prefix chord: ah = add item at parent level)
 */
export function handleAddNodeAtParent(ctx: OpCtx): void {
  const { repo } = ctx
  const cursorId = ctx.cursor
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
  ctx.setSelection(textCaret(newId, 0))
  ctx.textEditHints = { blockIndex: 0 }
  requestRenderFlush()
}

/**
 * Duplicate a node: create a copy immediately after it with the same content and type.
 * Pushes an undo entry that deletes the new node.
 */
export function handleDuplicateNode(ctx: OpCtx, nodeId: string): void {
  const { repo } = ctx
  if (!ctx.columnId) return

  const sourceNode = repo.getNode(nodeId)
  if (!sourceNode) return

  // Find position in siblings
  const siblings = repo.getChildren(ctx.columnId)
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

  // Auto-recorded by undoable repo — no manual undo entry needed
  ctx.undoHandle.setCursor(ctx.cursor)
  const newId = repo.addNode(ctx.columnId, newNode)

  ctx.setSelection(nodeSelect(newId))
}

/**
 * Confirm move operation - move selected nodes to target column.
 */
export function handleConfirmMove(ctx: OpCtx): void {
  const { repo } = ctx
  const sourceNodeIds = ctx.moveState.active ? ctx.moveState.sourceNodes : []
  if (sourceNodeIds.length === 0) return
  if (!ctx.columnId) return

  // Snapshot tree BEFORE mutations for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(repo, selRoot)

  // Batch all moves into a single undo entry
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Move cards")

  let newSortOrder = Tree.toSortOrder(repo, Position.last(ctx.columnId)).sortOrder
  for (const nodeId of sourceNodeIds) {
    repo.moveNode(nodeId, ctx.columnId, newSortOrder)
    newSortOrder++
  }

  ctx.undoHandle.endBatch()
  ctx.dispatchBoard({ type: "CONFIRM_MOVE" })

  // Atomic selection repair: transform handles cursor/anchor for moved nodes
  const nextTree = captureTree(repo, selRoot)
  for (const nodeId of sourceNodeIds) {
    ctx.sel.transform({ type: "moveNode", id: nodeId as ID, newParent: ctx.columnId as ID }, prevTree, nextTree)
  }
}

/**
 * Set task status.
 *
 * If `explicitStatus` is provided (from the op), applies it directly — this is
 * the path used by `toggle_task_done` (binary todo↔done flip) and the explicit
 * `set_status_*` commands. If omitted, cycles todo → wip → blocked → done →
 * dropped — used by `cycle_task_status`.
 *
 * Batch-aware: when multi-selection is active, applies to all selected cards.
 * In cycle mode, each card advances from its own current status independently.
 * Selection is preserved — status is an in-place modification.
 */
export function handleTaskStatusCycle(ctx: OpCtx, explicitStatus?: TaskStatus): void {
  const statusCycle: TaskStatus[] = ["todo", "wip", "blocked", "done", "dropped"]

  const count = forEachSelected(ctx, "Toggle status", (c) => {
    const embedTarget = c.embed_of
    const targetId = embedTarget || c.id
    const targetNode = embedTarget ? ctx.repo.getNode(embedTarget) : c
    const currentStatus = targetNode?.item?.task?.status || "todo"
    let nextStatus: TaskStatus
    if (explicitStatus !== undefined) {
      nextStatus = explicitStatus
    } else {
      const currentIndex = statusCycle.indexOf(currentStatus)
      const nextIndex = (currentIndex + 1) % statusCycle.length
      nextStatus = statusCycle[nextIndex] ?? "todo"
    }

    // Recurrence: when a recurring task transitions to "done", clone it with next due date
    const dueParts = targetNode ? extractTaskDates(targetNode).due : undefined
    if (nextStatus === "done" && targetNode?.rrule && dueParts?.date) {
      const nextDue = getNextOccurrence(targetNode.rrule, dueParts.date)
      // Mark current task done with completion timestamp
      runRepoEffect(ctx, {
        type: "REPO_UPDATE_NODE",
        nodeId: targetId,
        updates: {
          item: { task: { status: "done", marker: "[x]" } },
          completed_at: Date.now(),
        },
      })
      if (nextDue) {
        // Clone task with next due date, reset to todo
        // Compose due_at from the next due date + existing time
        const nextDueAt = dueParts.time ? `${nextDue}T${dueParts.time}` : nextDue
        const parentId = targetNode.parent_id
        if (parentId) {
          runRepoEffect(ctx, {
            type: "REPO_ADD_NODE",
            parentId,
            selectAfter: false,
            node: {
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
            },
          })
        }
      }
    } else {
      runRepoEffect(ctx, {
        type: "REPO_UPDATE_NODE",
        nodeId: targetId,
        updates: {
          item: { ...targetNode?.item, task: { status: nextStatus, marker: getMarkerForStatus(nextStatus) } },
        },
      })
    }
  })

  if (count === 0) return

  // Selection preserved: status toggle is in-place modification.
  // User can press x again to cycle all selected cards further.
  // Re-select current node to trigger UI update
  ctx.setSelection(nodeSelect(ctx.cursor as string))
}

/**
 * Clear all task properties from selected cards (status, dates, priority, assignee, recurrence).
 * Batch-aware: when multi-selection is active, clears all selected cards.
 */
export function handleClearTask(ctx: OpCtx): void {
  const count = forEachSelected(ctx, "Clear task", (c) => {
    const targetId = c.embed_of || c.id
    const targetNode = ctx.repo.getNode(targetId)
    runRepoEffect(ctx, {
      type: "REPO_UPDATE_NODE",
      nodeId: targetId,
      updates: {
        item: { ...targetNode?.item, task: undefined },
        due_at: undefined,
        start_at: undefined,
        priority: undefined,
        assigned_to: undefined,
        rrule: undefined,
        completed_at: undefined,
      },
    })
  })

  if (count === 0) return
  ctx.setSelection(nodeSelect(ctx.cursor as string))
}

/**
 * Shift card or column in a direction.
 *
 * When cursor is on a card: up/down shifts within column, left/right moves between columns.
 * When cursor is on a column header: left/right reorders columns.
 */
export function handleShiftCard(ctx: OpCtx, direction: "up" | "down" | "left" | "right"): OpResult {
  const card = ctx.card

  if (!card) {
    // At column header level — reorder columns left/right
    // Virtual columns (body column) can't be moved
    if (ctx.columnId && (direction === "left" || direction === "right")) {
      const colViewType = ctx.tree.track(ctx.columnId)?.viewType()
      if (colViewType === "body-column") return boundary(direction)
      const colNode = ctx.repo.getNode(ctx.columnId)
      if (colNode) return moveColumn(ctx, { node: colNode }, direction)
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
 * Reorder a column by swapping its position with the adjacent column.
 *
 * Performs the move by computing the desired final visible order and assigning
 * each column a unique parent_idx that matches that order. Only writes columns
 * whose parent_idx actually changes — keeps the common case (cleanly-numbered
 * columns) cheap while still handling the messy case (folder-imported columns
 * with all parent_idx=0) correctly.
 *
 * Why naive swap doesn't work: when sibling columns share parent_idx (e.g.,
 * all 0 from a fresh folder import), the SQL `ORDER BY parent_idx, created_at`
 * tiebreaker means swapping just two columns' indices can shove the moved
 * column past additional siblings that also share that parent_idx value.
 */
function moveColumn(
  ctx: OpCtx,
  col: { node: { id: string; parent_idx: number } },
  direction: "left" | "right",
): OpResult {
  if (!ctx.rootId) return boundary("move", "no root")
  const colIds = ctx.tree.children(ctx.rootId)
  const colIndex = colIds.indexOf(col.node.id)
  const targetIndex = direction === "left" ? colIndex - 1 : colIndex + 1
  if (targetIndex < 0 || targetIndex >= colIds.length) return boundary(direction)

  const targetColId = colIds[targetIndex]!

  // Virtual columns (e.g., __body__) are synthetic — can't be moved in the repo
  const targetViewType = ctx.tree.track(targetColId)?.viewType()
  if (targetViewType === "body-column") return boundary(direction)

  // Build the desired final order: swap col with target in the visible array.
  const desiredOrder = [...colIds]
  desiredOrder[colIndex] = targetColId
  desiredOrder[targetIndex] = col.node.id

  // Batch the renumber writes into a single undo entry.
  ctx.undoHandle.setCursor(ctx.cursor)
  ctx.undoHandle.startBatch("Move column")

  renumberColumns(ctx, desiredOrder)

  ctx.undoHandle.endBatch()

  // Column moved — re-select by node ID (column header)
  ctx.setSelection(nodeSelect(col.node.id))
  return ok()
}

/**
 * Assign each column a parent_idx matching its position in `desiredOrder`,
 * but only for columns whose current parent_idx is incompatible with the
 * desired order. Skips virtual columns (body-column) — they have no repo node.
 *
 * Strategy:
 * - Walk `desiredOrder` left→right, tracking the running maximum of parent_idx
 *   values that already place columns correctly.
 * - When a column's current parent_idx is strictly greater than the running
 *   max AND it's not equal to the previous column's value, keep it as-is and
 *   bump the running max.
 * - Otherwise, assign it `runningMax + 1` and write to the repo.
 *
 * In the happy case (already-distinct ascending parent_idx), nothing is
 * written. In the messy case (all parent_idx=0), every column except the
 * first gets a fresh ascending value.
 *
 * Note: WriteQueue coalesces multiple writes to the same destination file
 * within the debounce window, so even N rewrites of an mdsection-backed board
 * collapse to one disk write.
 */
function renumberColumns(ctx: OpCtx, desiredOrder: readonly string[]): void {
  const { repo } = ctx
  const rootId = ctx.tree.rootId
  if (!rootId) return

  let runningMax = -Infinity

  for (const colId of desiredOrder) {
    const isVirtual = ctx.tree.track(colId)?.viewType() === "body-column"
    if (isVirtual) continue

    const node = repo.getNode(colId)
    if (!node) continue

    const current = node.parent_idx
    if (current > runningMax) {
      // Already in a position that produces correct visible order — keep it.
      runningMax = current
      continue
    }

    // Needs a fresh value strictly greater than the running max.
    const next = Number.isFinite(runningMax) ? runningMax + 1 : 0
    repo.moveNode(colId, rootId, next)
    runningMax = next
  }
}

/**
 * Indent a column: reparent it as the last card of the previous column.
 *
 * The column becomes a child of the previous column. Cursor moves to
 * the previous column to follow the indented content.
 */
export function handleIndentColumn(ctx: OpCtx, colId: string): OpResult {
  const { repo } = ctx
  const columnIds = ctx.tree.rootId ? [...ctx.tree.children(ctx.tree.rootId)] : []
  const colIndex = columnIds.indexOf(colId)

  // Need a previous column to indent into
  if (colIndex <= 0) return boundary("indent", "First column can't be indented")

  const prevColId = columnIds[colIndex - 1]
  if (!prevColId) return boundary("indent", "No previous column")

  // Calculate sort order: after last card in target column
  const { sortOrder: newSortOrder } = Tree.toSortOrder(repo, Position.last(prevColId))

  // Snapshot tree BEFORE mutation for sel.transform()
  const selRoot = ctx.sel.root.id()
  const prevTree = captureTree(repo, selRoot)

  // Record cursor for undo
  ctx.undoHandle.setCursor(ctx.cursor)

  // Move the column node under the previous column
  repo.moveNode(colId, prevColId, newSortOrder)

  // Atomic selection repair: transform handles cursor/anchor if node moved out of scope
  const nextTree = captureTree(repo, selRoot)
  ctx.sel.transform({ type: "moveNode", id: colId as ID, newParent: prevColId as ID }, prevTree, nextTree)

  return ok()
}
