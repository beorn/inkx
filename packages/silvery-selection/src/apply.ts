/**
 * Pure selection transitions.
 *
 * Every function: (state, args) -> newState. No side effects.
 * If the result equals the input, returns the SAME reference (enables signal equality skip).
 *
 * ids is readonly ID[] (plain array, serializable). NOT Set.
 * Drag previews are baseline-based: previewReplace/previewToggle compute against startState, not iteratively.
 */

import type { ID, SelectionSnapshot, SubSelectionBase, TextSelection } from "./types.ts"

// --- Helpers ---

/** The empty state. Reused singleton. */
export const EMPTY_STATE: SelectionSnapshot<never> = Object.freeze({
  cursor: null,
  anchor: null,
  ids: Object.freeze([]) as readonly ID[],
  sub: null,
  root: null,
})

/** Normalize an array of IDs to tree-walk order using nodeOrder. */
function normalizeToOrder(ids: readonly ID[], nodeOrder: readonly ID[]): ID[] {
  const idSet = new Set(ids)
  return nodeOrder.filter((id) => idSet.has(id))
}

/** Check if two readonly ID[] have the same contents in the same order. */
export function arraysEqual(a: readonly ID[], b: readonly ID[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Get range of IDs from anchor to cursor in nodeOrder (inclusive). */
function getRange(anchor: ID, cursor: ID, nodeOrder: readonly ID[]): ID[] {
  const anchorIdx = nodeOrder.indexOf(anchor)
  const cursorIdx = nodeOrder.indexOf(cursor)
  if (anchorIdx === -1 || cursorIdx === -1) return []
  const start = Math.min(anchorIdx, cursorIdx)
  const end = Math.max(anchorIdx, cursorIdx)
  return nodeOrder.slice(start, end + 1)
}

// --- Transitions ---

/**
 * Replace or XOR-toggle selection.
 * IDs are normalized to nodeOrder. Cursor/anchor follow the rules table.
 */
export function applySelect<Sub>(
  state: SelectionSnapshot<Sub>,
  ids: readonly ID[],
  nodeOrder: readonly ID[],
  toggle?: boolean,
): SelectionSnapshot<Sub> {
  if (ids.length === 0 && !toggle) {
    return applyDeselect(state)
  }

  if (toggle) {
    return applyToggle(state, ids, nodeOrder)
  }

  // Replace mode
  const normalized = normalizeToOrder(ids, nodeOrder)
  if (normalized.length === 0) {
    return applyDeselect(state)
  }

  const newCursor = normalized[0]!
  const newAnchor = normalized.at(-1)!

  // Check if no change
  if (
    state.cursor === newCursor &&
    state.anchor === newAnchor &&
    arraysEqual(state.ids, normalized) &&
    state.sub === null
  ) {
    return state
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: normalized,
    sub: null, // node op clears sub
    root: state.root,
  }
}

function applyToggle<Sub>(
  state: SelectionSnapshot<Sub>,
  ids: readonly ID[],
  nodeOrder: readonly ID[],
): SelectionSnapshot<Sub> {
  const toggleSet = new Set(ids)
  const currentSet = new Set(state.ids)

  // Partition: which to add, which to remove
  const toAdd: ID[] = []
  const toRemove: ID[] = []
  for (const id of ids) {
    if (currentSet.has(id)) {
      toRemove.push(id)
    } else {
      toAdd.push(id)
    }
  }

  // Build new set
  const newIdSet = new Set(currentSet)
  for (const id of toRemove) newIdSet.delete(id)
  for (const id of toAdd) newIdSet.add(id)

  if (newIdSet.size === 0) {
    return applyDeselect(state)
  }

  // Normalize to order
  const normalized = nodeOrder.filter((id) => newIdSet.has(id))

  // Determine cursor/anchor per rules table
  let newCursor: ID | null
  let newAnchor: ID | null

  if (toAdd.length > 0) {
    // Toggle add: cursor = first of newly added (in order), anchor preserved
    const addedInOrder = normalizeToOrder(toAdd, nodeOrder)
    newCursor = addedInOrder[0] ?? normalized[0]!
    newAnchor = state.anchor !== null && newIdSet.has(state.anchor) ? state.anchor : newCursor
  } else {
    // Toggle remove only
    const removedCursor = state.cursor !== null && toggleSet.has(state.cursor)
    if (removedCursor) {
      // Cursor was removed: first remaining
      newCursor = normalized[0]!
      newAnchor = newCursor
    } else {
      // Cursor preserved
      newCursor = state.cursor
      newAnchor = state.anchor !== null && newIdSet.has(state.anchor) ? state.anchor : newCursor
    }
  }

  if (
    state.cursor === newCursor &&
    state.anchor === newAnchor &&
    arraysEqual(state.ids, normalized) &&
    state.sub === null
  ) {
    return state
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: normalized,
    sub: null,
    root: state.root,
  }
}

/**
 * Extend range: anchor stays, cursor moves, fills between.
 */
export function applyExtend<Sub>(
  state: SelectionSnapshot<Sub>,
  cursor: ID,
  nodeOrder: readonly ID[],
): SelectionSnapshot<Sub> {
  const anchor = state.anchor ?? cursor
  const range = getRange(anchor, cursor, nodeOrder)
  if (range.length === 0) return state

  if (state.cursor === cursor && state.anchor === anchor && arraysEqual(state.ids, range) && state.sub === null) {
    return state
  }

  return {
    cursor,
    anchor,
    ids: range,
    sub: null,
    root: state.root,
  }
}

/**
 * Multi -> single. Keep cursor, reset anchor to cursor.
 */
export function applyCollapse<Sub>(state: SelectionSnapshot<Sub>): SelectionSnapshot<Sub> {
  if (state.cursor === null) return state

  // Already collapsed
  if (state.ids.length === 1 && state.anchor === state.cursor && state.sub === null) {
    return state
  }

  return {
    cursor: state.cursor,
    anchor: state.cursor,
    ids: [state.cursor],
    sub: null,
    root: state.root,
  }
}

/**
 * Remove one ID from selection. Repairs cursor/anchor.
 */
export function applyRemove<Sub>(
  state: SelectionSnapshot<Sub>,
  id: ID,
  nodeOrder?: readonly ID[],
): SelectionSnapshot<Sub> {
  if (state.ids.indexOf(id) === -1) return state

  const remaining = state.ids.filter((x) => x !== id)
  if (remaining.length === 0) {
    return applyDeselect(state)
  }

  // Repair cursor/anchor per rules table
  let newCursor: ID | null
  let newAnchor: ID | null

  if (state.cursor === id) {
    // Cursor removed: use nodeOrder to find nearest, or first remaining
    if (nodeOrder) {
      const remainingSet = new Set(remaining)
      const ordered = nodeOrder.filter((x) => remainingSet.has(x))
      newCursor = ordered[0] ?? remaining[0]!
    } else {
      newCursor = remaining[0]!
    }
    newAnchor = newCursor
  } else {
    newCursor = state.cursor
    newAnchor = state.anchor !== null && remaining.indexOf(state.anchor) !== -1 ? state.anchor : newCursor
  }

  if (
    state.cursor === newCursor &&
    state.anchor === newAnchor &&
    arraysEqual(state.ids, remaining) &&
    state.sub === null
  ) {
    return state
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: remaining,
    sub: null,
    root: state.root,
  }
}

/**
 * Clear everything. Returns EMPTY_STATE with preserved root.
 */
export function applyDeselect<Sub>(state?: SelectionSnapshot<Sub>): SelectionSnapshot<Sub> {
  if (state === undefined) return EMPTY_STATE as SelectionSnapshot<Sub>

  if (state.cursor === null && state.anchor === null && state.ids.length === 0 && state.sub === null) {
    return state
  }

  if (state.root === null) return EMPTY_STATE as SelectionSnapshot<Sub>

  return {
    cursor: null,
    anchor: null,
    ids: [],
    sub: null,
    root: state.root,
  }
}

/**
 * Progressive select-all.
 *
 * @param parent - ID of the parent in which to expand, or null for root-level
 * @param children - children of that parent, in tree-walk order
 */
export function applySelectAll<Sub>(
  state: SelectionSnapshot<Sub>,
  parent: ID | null,
  children: readonly ID[],
): SelectionSnapshot<Sub> {
  if (children.length === 0) return state

  // Check if all children are already selected
  const currentSet = new Set(state.ids)
  const allSelected = children.every((id) => currentSet.has(id))

  if (allSelected) {
    // Already have all children => no-op at this level (caller should ascend)
    return state
  }

  const newCursor = state.cursor !== null && children.indexOf(state.cursor) !== -1 ? state.cursor : children[0]!
  const newAnchor = newCursor

  if (
    state.cursor === newCursor &&
    state.anchor === newAnchor &&
    arraysEqual(state.ids, children) &&
    state.sub === null
  ) {
    return state
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: [...children],
    sub: null, // node op clears sub
    root: state.root,
  }
}

/**
 * Enter text editing mode.
 */
export function applyTextEdit<Sub>(state: SelectionSnapshot<Sub>, nodeId: ID, offset: number): SelectionSnapshot<Sub> {
  const newSub: TextSelection = { kind: "text", nodeId, cursor: offset }

  // Check if already in identical text mode
  const existing = state.sub as unknown as TextSelection | null
  if (
    existing?.kind === "text" &&
    existing.nodeId === nodeId &&
    existing.cursor === offset &&
    existing.anchor === undefined
  ) {
    return state
  }

  return {
    cursor: state.cursor,
    anchor: state.anchor,
    ids: state.ids,
    sub: newSub as unknown as Sub,
    root: state.root,
  }
}

/**
 * Move text caret or set text range. No-op if not in text mode.
 */
export function applyTextSelect<Sub>(
  state: SelectionSnapshot<Sub>,
  cursor?: number,
  anchor?: number,
): SelectionSnapshot<Sub> {
  if (state.sub === null) return state
  const textSub = state.sub as unknown as TextSelection
  if (textSub.kind !== "text") return state

  const newCursor = cursor ?? textSub.cursor
  const newAnchor = anchor

  if (textSub.cursor === newCursor && textSub.anchor === newAnchor) {
    return state
  }

  return {
    cursor: state.cursor,
    anchor: state.anchor,
    ids: state.ids,
    sub: {
      kind: "text",
      nodeId: textSub.nodeId,
      cursor: newCursor,
      anchor: newAnchor,
    } as unknown as Sub,
    root: state.root,
  }
}

/**
 * Exit sub-selection, preserve node selection.
 */
export function applyExitSub<Sub>(state: SelectionSnapshot<Sub>): SelectionSnapshot<Sub> {
  if (state.sub === null) return state

  return {
    cursor: state.cursor,
    anchor: state.anchor,
    ids: state.ids,
    sub: null,
    root: state.root,
  }
}

/**
 * Prune deleted IDs, repair cursor/anchor. Drag-cancel is the caller's concern.
 */
export function applyReconcile<Sub extends SubSelectionBase>(
  state: SelectionSnapshot<Sub>,
  validIds: ReadonlySet<ID>,
  nodeOrder: readonly ID[],
): SelectionSnapshot<Sub> {
  // Filter to only valid IDs, in tree-walk order
  const currentSet = new Set(state.ids)
  const remaining = nodeOrder.filter((id) => currentSet.has(id) && validIds.has(id))

  if (remaining.length === state.ids.length) {
    // All still valid — check if order changed or sub needs pruning
    const subValid = state.sub === null || validIds.has(state.sub.nodeId)

    if (subValid) {
      // Check order preserved
      if (arraysEqual(state.ids, remaining)) return state
    }
  }

  if (remaining.length === 0) {
    // All removed
    if (state.root === null) return EMPTY_STATE as SelectionSnapshot<Sub>
    return {
      cursor: null,
      anchor: null,
      ids: [],
      sub: null,
      root: state.root,
    }
  }

  const remainingSet = new Set(remaining)

  // Repair cursor
  let newCursor: ID | null
  if (state.cursor !== null && remainingSet.has(state.cursor)) {
    newCursor = state.cursor
  } else {
    // Find nearest remaining in tree-walk order
    if (state.cursor !== null) {
      const oldIdx = nodeOrder.indexOf(state.cursor)
      let best: ID | null = null
      let bestDist = Infinity
      for (const id of remaining) {
        const idx = nodeOrder.indexOf(id)
        const dist = Math.abs(idx - oldIdx)
        if (dist < bestDist) {
          bestDist = dist
          best = id
        }
      }
      newCursor = best
    } else {
      newCursor = remaining[0]!
    }
  }

  // Repair anchor
  let newAnchor: ID | null
  if (state.anchor !== null && remainingSet.has(state.anchor)) {
    newAnchor = state.anchor
  } else {
    newAnchor = newCursor
  }

  // Prune sub if referencing deleted node
  let newSub: Sub | null = state.sub
  if (newSub !== null) {
    if (!validIds.has(newSub.nodeId)) {
      newSub = null
    }
  }

  if (
    state.cursor === newCursor &&
    state.anchor === newAnchor &&
    arraysEqual(state.ids, remaining) &&
    state.sub === newSub
  ) {
    return state
  }

  return {
    cursor: newCursor,
    anchor: newAnchor,
    ids: remaining,
    sub: newSub,
    root: state.root,
  }
}

/**
 * Set root ID.
 */
export function applySetRoot<Sub>(state: SelectionSnapshot<Sub>, id: ID | null): SelectionSnapshot<Sub> {
  if (state.root === id) return state

  return {
    cursor: state.cursor,
    anchor: state.anchor,
    ids: state.ids,
    sub: state.sub,
    root: id,
  }
}

/**
 * Pop root to parent. Uses parentOf to walk up.
 */
export function applyRootUp<Sub>(
  state: SelectionSnapshot<Sub>,
  parentOf: (id: ID) => ID | null,
): SelectionSnapshot<Sub> {
  if (state.root === null) return state

  const parent = parentOf(state.root)
  if (state.root === parent) return state // shouldn't happen, but guard

  return {
    cursor: state.cursor,
    anchor: state.anchor,
    ids: state.ids,
    sub: state.sub,
    root: parent,
  }
}

// --- Dev-mode invariant assertions ---

export class SelectionInvariantError extends Error {
  constructor(message: string) {
    super(`SelectionInvariantError: ${message}`)
    this.name = "SelectionInvariantError"
  }
}

/**
 * Assert selection state invariants. Throws SelectionInvariantError on violation.
 *
 * Checks:
 * - cursor is in ids (if cursor is non-null)
 * - anchor is in ids (if anchor is non-null)
 * - ids has no duplicates
 * - cursor === ids[0] when ids is non-empty
 * - sub.nodeId is a valid ID when sub is non-null
 */
export function assertInvariants<Sub extends SubSelectionBase>(state: SelectionSnapshot<Sub>): void {
  const { cursor, anchor, ids, sub } = state

  // cursor is in ids
  if (cursor !== null && ids.indexOf(cursor) === -1) {
    throw new SelectionInvariantError(`cursor "${cursor}" is not in ids [${ids.join(", ")}]`)
  }

  // anchor is in ids
  if (anchor !== null && ids.indexOf(anchor) === -1) {
    throw new SelectionInvariantError(`anchor "${anchor}" is not in ids [${ids.join(", ")}]`)
  }

  // ids has no duplicates
  if (new Set(ids).size !== ids.length) {
    throw new SelectionInvariantError(`ids contains duplicates: [${ids.join(", ")}]`)
  }

  // cursor === ids[0] when ids is non-empty
  if (ids.length > 0 && cursor !== ids[0]) {
    throw new SelectionInvariantError(`cursor "${cursor}" !== ids[0] "${ids[0]}" (cursor must be first)`)
  }

  // sub.nodeId must be valid when sub is non-null
  if (sub !== null) {
    if (!sub.nodeId) {
      throw new SelectionInvariantError(`sub-selection (kind="${sub.kind}") has no nodeId`)
    }
  }
}
