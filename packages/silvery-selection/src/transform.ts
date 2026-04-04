/**
 * Transform selection inline with tree ops (SlateJS pattern).
 *
 * Instead of reconciling selection as a separate effect after tree changes,
 * each tree op transforms selection in the same apply() call — one transaction, atomic.
 *
 * transformSelection receives BOTH pre- and post-op trees — needed for
 * "nearest surviving node" repair and identity-preserving moves.
 */

import type { ID, SelectionSnapshot, SubSelection } from "./types.ts"
import { EMPTY_STATE } from "./apply.ts"

// --- Tree op types ---

export type TreeOp =
  | { readonly type: "deleteNode"; readonly id: ID }
  | { readonly type: "moveNode"; readonly id: ID; readonly newParent: ID }
  | { readonly type: "insertNode"; readonly id: ID; readonly parent: ID }
  | { readonly type: "updateNode"; readonly id: ID }

// --- SelectionTree interface ---

/** Minimal tree interface needed by transformSelection. */
export type SelectionTree = {
  /** All node IDs in tree-walk order (within root scope). */
  walkOrder(root: ID | null): readonly ID[]
  /** Whether a node exists in the tree. */
  has(id: ID): boolean
  /** Whether `descendant` is inside the subtree rooted at `ancestor` (or is `ancestor` itself). */
  contains(ancestor: ID, descendant: ID): boolean
}

// --- Helpers ---

function arraysEqual(a: readonly ID[], b: readonly ID[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Find nearest remaining node to `target` in nodeOrder. */
function findNearest(target: ID, remaining: readonly ID[], prevOrder: readonly ID[]): ID | null {
  if (remaining.length === 0) return null
  const targetIdx = prevOrder.indexOf(target)
  if (targetIdx === -1) return remaining[0] ?? null

  let best: ID | null = null
  let bestDist = Infinity
  for (const id of remaining) {
    const idx = prevOrder.indexOf(id)
    const dist = Math.abs(idx - targetIdx)
    if (dist < bestDist) {
      bestDist = dist
      best = id
    }
  }
  return best
}

/** Check if a sub-selection references a given node ID. */
function subReferencesNode(sub: SubSelection, id: ID): boolean {
  switch (sub.kind) {
    case "text":
      return sub.nodeId === id
    case "path":
      return sub.shapeId === id
    case "crop":
      return sub.objectId === id
  }
}

/** Whether a node is within the selection root scope in a given tree. */
function isInScope(tree: SelectionTree, root: ID | null, nodeId: ID): boolean {
  if (!tree.has(nodeId)) return false
  if (root === null) return true
  return tree.contains(root, nodeId)
}

// --- Transform ---

/**
 * Transform selection inline with a tree op.
 *
 * For each op type:
 * - deleteNode(id): remove id from sel.ids, repair cursor/anchor, clear sub if referencing deleted node
 * - moveNode(id, newParent): keep if still in scope (under root), remove if moved outside
 * - insertNode: no selection change (new nodes aren't selected)
 * - updateNode: no selection change (content change, not structural)
 */
export function transformSelection(
  sel: SelectionSnapshot,
  op: TreeOp,
  prevTree: SelectionTree,
  nextTree: SelectionTree,
): SelectionSnapshot {
  switch (op.type) {
    case "insertNode":
    case "updateNode":
      return sel

    case "deleteNode":
      return transformDelete(sel, op.id, prevTree, nextTree)

    case "moveNode":
      return transformMove(sel, op.id, prevTree, nextTree)
  }
}

function transformDelete(
  sel: SelectionSnapshot,
  deletedId: ID,
  prevTree: SelectionTree,
  nextTree: SelectionTree,
): SelectionSnapshot {
  const isSelected = sel.ids.indexOf(deletedId) !== -1
  const subAffected = sel.sub !== null && subReferencesNode(sel.sub, deletedId)

  // Nothing to do if the deleted node isn't in our selection and doesn't affect sub
  if (!isSelected && !subAffected) return sel

  // Remove the deleted ID from ids
  const remaining = isSelected ? sel.ids.filter((id) => id !== deletedId) : [...sel.ids]

  // Re-order remaining to nextTree walk order
  const nextOrder = nextTree.walkOrder(sel.root)
  const remainingSet = new Set(remaining)
  const ordered = nextOrder.filter((id) => remainingSet.has(id))

  if (ordered.length === 0) {
    // All selected nodes gone
    if (sel.root === null) return EMPTY_STATE
    return {
      cursor: null,
      anchor: null,
      ids: [],
      sub: null,
      root: sel.root,
    }
  }

  // Repair cursor
  let newCursor: ID | null
  if (sel.cursor !== null && sel.cursor !== deletedId && remainingSet.has(sel.cursor)) {
    newCursor = sel.cursor
  } else if (sel.cursor !== null) {
    // Cursor was deleted — find nearest in prev tree order
    const prevOrder = prevTree.walkOrder(sel.root)
    newCursor = findNearest(sel.cursor, ordered, prevOrder)
  } else {
    newCursor = ordered[0] ?? null
  }

  // Repair anchor
  let newAnchor: ID | null
  if (sel.anchor !== null && sel.anchor !== deletedId && remainingSet.has(sel.anchor)) {
    newAnchor = sel.anchor
  } else {
    newAnchor = newCursor
  }

  // Clear sub if referencing deleted node
  const newSub = subAffected ? null : sel.sub

  // Check if nothing changed
  if (sel.cursor === newCursor && sel.anchor === newAnchor && arraysEqual(sel.ids, ordered) && sel.sub === newSub) {
    return sel
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: ordered,
    sub: newSub,
    root: sel.root,
  }
}

function transformMove(
  sel: SelectionSnapshot,
  movedId: ID,
  _prevTree: SelectionTree,
  nextTree: SelectionTree,
): SelectionSnapshot {
  const isSelected = sel.ids.indexOf(movedId) !== -1
  const subAffected = sel.sub !== null && subReferencesNode(sel.sub, movedId)

  // If the moved node isn't relevant to our selection, nothing to do
  if (!isSelected && !subAffected) return sel

  // Check if the moved node is still in scope after the move
  const stillInScope = isInScope(nextTree, sel.root, movedId)

  if (stillInScope) {
    // Node is still in scope — re-order ids to nextTree walk order, preserve sub
    const nextOrder = nextTree.walkOrder(sel.root)
    const currentSet = new Set(sel.ids)
    const reordered = nextOrder.filter((id) => currentSet.has(id))

    if (arraysEqual(sel.ids, reordered)) return sel

    return {
      cursor: sel.cursor,
      anchor: sel.anchor,
      ids: reordered,
      sub: sel.sub,
      root: sel.root,
    }
  }

  // Node moved outside scope — remove it from selection
  const remaining = sel.ids.filter((id) => id !== movedId)

  if (remaining.length === 0) {
    if (sel.root === null) return EMPTY_STATE
    return {
      cursor: null,
      anchor: null,
      ids: [],
      sub: subAffected ? null : sel.sub,
      root: sel.root,
    }
  }

  const remainingSet = new Set(remaining)

  // Re-order to nextTree walk order
  const nextOrder = nextTree.walkOrder(sel.root)
  const ordered = nextOrder.filter((id) => remainingSet.has(id))

  // Repair cursor
  let newCursor: ID | null
  if (sel.cursor !== null && sel.cursor !== movedId && remainingSet.has(sel.cursor)) {
    newCursor = sel.cursor
  } else {
    newCursor = ordered[0] ?? null
  }

  // Repair anchor
  let newAnchor: ID | null
  if (sel.anchor !== null && sel.anchor !== movedId && remainingSet.has(sel.anchor)) {
    newAnchor = sel.anchor
  } else {
    newAnchor = newCursor
  }

  // Clear sub if it referenced the moved node
  const newSub = subAffected ? null : sel.sub

  if (sel.cursor === newCursor && sel.anchor === newAnchor && arraysEqual(sel.ids, ordered) && sel.sub === newSub) {
    return sel
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: ordered,
    sub: newSub,
    root: sel.root,
  }
}
