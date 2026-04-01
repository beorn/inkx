/**
 * Board Reducer — Pure Navigation State Machine
 *
 * Pure functions following TEA shape: Board.apply(state, op) → [state, effects]
 *
 * Operations are data (discriminated unions). Effects are data (discriminated unions).
 * State transitions are pure functions. The runtime applies effects.
 *
 * This is Phase 1a of the Board.apply() extraction (bead: km-tui.board-apply).
 * Covers navigation operations only — no repo mutations.
 *
 * See docs/design/tea-state-machines.md for the full TEA vision.
 */

import type { KNode } from "@km/core"

// =============================================================================
// State
// =============================================================================

/**
 * Board navigation state — the subset of board state that navigation operates on.
 *
 * Plain object, no classes, no methods. Passed to Board.apply() and returned
 * (possibly modified) in the result.
 */
export interface BoardNavState {
  cursorNodeId: string | null
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null

  foldDepths: Map<string, number>
  collapsedNodes: Set<string>

  /** Node IDs hidden from view (navigation skips them) */
  hiddenNodeIds: Set<string>

  /** Root node of the current zoom level */
  rootId: string | null

  /** Scroll anchor — when set, viewport follows this anchor instead of cursor */
  columnScrollAnchor: { colIdx: number; anchor: number } | null
}

// =============================================================================
// Effects
// =============================================================================

/**
 * Effects produced by Board.apply(). The runtime interprets these.
 *
 * Effects are data — discriminated union, serializable, no functions.
 */
export type BoardEffect =
  | { type: "SELECT"; nodeId: string }
  | { type: "FOLD_SET"; depths: Map<string, number> }
  | { type: "SCROLL_ANCHOR_CLEAR" }

// =============================================================================
// Result
// =============================================================================

export type ApplyResult = {
  state: BoardNavState
  effects: BoardEffect[]
}

// =============================================================================
// Read-only context for navigation
// =============================================================================

// =============================================================================
// Operations (using TEA terminology: "operation", not "action")
// =============================================================================

export type BoardNavOp =
  | { type: "BLOCK_NAV"; direction: "up" | "down"; visibleBlocks: string[] }
  | { type: "OUTLINE_NAV"; direction: "prev" | "next"; descendantIds: string[] }
  | { type: "SELECT"; nodeId: string }
  | { type: "PAGE_JUMP"; direction: "up" | "down"; cardIds: string[]; currentCardIndex: number; pageSize: number }
  | { type: "FOLD_LEVEL"; cardIds: string[] }
  | { type: "UNFOLD_LEVEL"; cardIds: string[] }
  | { type: "TOGGLE_FOLD"; nodeId: string; hasChildren: boolean }
  | {
      type: "FOLD_NODE"
      scope: "root" | "card"
      rootId: string
      targetIds: string[]
      columnCardIds: string[]
    }
  | {
      type: "UNFOLD_NODE"
      scope: "root" | "card"
      rootId: string
      targetIds: string[]
      columnCardIds: string[]
    }
  | { type: "UNFOLD_RECURSIVE"; cardId: string; descendantFoldIds: string[] }

/**
 * Maximum fold depth. Prevents runaway expansion when unfolding.
 * 20 levels is very generous — most real outlines are 3-5 levels deep.
 */
export const MAX_FOLD_DEPTH = 20

// =============================================================================
// Board.apply — pure state machine
// =============================================================================

/**
 * Apply a navigation operation to board state.
 * Pure function: no side effects, no repo mutations.
 *
 * @returns New state + effects for the runtime to execute
 */
export function applyNavigation(state: BoardNavState, op: BoardNavOp): ApplyResult {
  switch (op.type) {
    case "SELECT":
      return applySelect(state, op.nodeId)
    case "BLOCK_NAV":
      return applyBlockNav(state, op.direction, op.visibleBlocks)
    case "OUTLINE_NAV":
      return applyOutlineNav(state, op.direction, op.descendantIds)
    case "PAGE_JUMP":
      return applyPageJump(state, op.direction, op.cardIds, op.currentCardIndex, op.pageSize)
    case "FOLD_LEVEL":
      return applyFoldLevel(state, op.cardIds)
    case "UNFOLD_LEVEL":
      return applyUnfoldLevel(state, op.cardIds)
    case "TOGGLE_FOLD":
      return applyToggleFold(state, op.nodeId, op.hasChildren)
    case "FOLD_NODE":
      return applyFoldNode(state, op.scope, op.rootId, op.targetIds, op.columnCardIds)
    case "UNFOLD_NODE":
      return applyUnfoldNode(state, op.scope, op.rootId, op.targetIds, op.columnCardIds)
    case "UNFOLD_RECURSIVE":
      return applyUnfoldRecursive(state, op.cardId, op.descendantFoldIds)
    default: {
      const _exhaustive: never = op
      throw new Error(`Unhandled BoardNavOp: ${(_exhaustive as { type: string }).type}`)
    }
  }
}

// =============================================================================
// Pure navigation functions
// =============================================================================

/** Basic cursor move — the fast-path SELECT. */
export function applySelect(state: BoardNavState, nodeId: string): ApplyResult {
  return {
    state: { ...state, cursorNodeId: nodeId },
    effects: [{ type: "SELECT", nodeId }],
  }
}

/**
 * Spatial block navigation (J/K — next/previous visible block in column).
 *
 * visibleBlocks is pre-computed by the caller: [column header, card1, card1-child1, ...]
 * This function is pure index arithmetic.
 */
export function applyBlockNav(state: BoardNavState, direction: "up" | "down", visibleBlocks: string[]): ApplyResult {
  if (!state.cursorNodeId) return noChange(state)
  if (visibleBlocks.length === 0) return noChange(state)

  const currentIdx = visibleBlocks.indexOf(state.cursorNodeId)
  if (currentIdx < 0) return noChange(state)

  const targetIdx = direction === "down" ? currentIdx + 1 : currentIdx - 1
  if (targetIdx < 0 || targetIdx >= visibleBlocks.length) return noChange(state)

  const targetId = visibleBlocks[targetIdx]!
  return applySelect(state, targetId)
}

/**
 * Outline mode prev/next sub-item navigation.
 *
 * descendantIds is pre-computed by the caller (visible descendants of the card).
 * Pure index arithmetic.
 */
export function applyOutlineNav(
  state: BoardNavState,
  direction: "prev" | "next",
  descendantIds: string[],
): ApplyResult {
  if (!state.cursorNodeId) return noChange(state)

  const currentIdx = descendantIds.indexOf(state.cursorNodeId)
  if (currentIdx < 0) return noChange(state)

  const targetIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1
  if (targetIdx < 0 || targetIdx >= descendantIds.length) return noChange(state)

  const targetId = descendantIds[targetIdx]
  if (!targetId) return noChange(state)

  return applySelect(state, targetId)
}

/**
 * Page jump — move cursor by pageSize cards in the given direction.
 *
 * cardIds is the ordered list of card IDs in the column.
 * currentCardIndex is the index of the current card.
 * pageSize is calculated by the caller based on viewport dimensions.
 */
export function applyPageJump(
  state: BoardNavState,
  direction: "up" | "down",
  cardIds: string[],
  currentCardIndex: number,
  pageSize: number,
): ApplyResult {
  if (cardIds.length === 0) return noChange(state)

  const targetIdx =
    direction === "up"
      ? Math.max(0, currentCardIndex - pageSize)
      : Math.min(cardIds.length - 1, currentCardIndex + pageSize)

  if (targetIdx === currentCardIndex) return noChange(state)

  const targetId = cardIds[targetIdx]
  if (!targetId) return noChange(state)

  const newState: BoardNavState = {
    ...state,
    cursorNodeId: targetId,
    columnScrollAnchor: null,
  }
  return {
    state: newState,
    effects: [{ type: "SCROLL_ANCHOR_CLEAR" }, { type: "SELECT", nodeId: targetId }],
  }
}

// =============================================================================
// Fold operations — pure foldDepths map manipulation
// =============================================================================

/** Fold all cards in all columns to depth 0 (collapse everything). */
export function applyFoldLevel(state: BoardNavState, cardIds: string[]): ApplyResult {
  const newDepths = new Map(state.foldDepths)
  for (const id of cardIds) {
    newDepths.set(id, 0)
  }
  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

/** Unfold all cards in all columns (remove fold depths). */
export function applyUnfoldLevel(state: BoardNavState, cardIds: string[]): ApplyResult {
  const newDepths = new Map(state.foldDepths)
  for (const id of cardIds) {
    newDepths.delete(id)
  }
  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

/** Toggle fold on a specific node. If folded, unfold. If unfolded, fold to depth 0. */
export function applyToggleFold(state: BoardNavState, nodeId: string, hasChildren: boolean): ApplyResult {
  if (!hasChildren) return noChange(state)

  const newDepths = new Map(state.foldDepths)
  if (newDepths.has(nodeId)) {
    newDepths.delete(nodeId)
  } else {
    newDepths.set(nodeId, 0)
  }
  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

/**
 * Fold node(s) — decrease fold depth by 1.
 *
 * scope "root": decrease root depth, clear all card-level depths.
 * scope "card": decrease target node depths by 1 (clamped to 0).
 */
export function applyFoldNode(
  state: BoardNavState,
  scope: "root" | "card",
  rootId: string,
  targetIds: string[],
  columnCardIds: string[],
): ApplyResult {
  const newDepths = new Map(state.foldDepths)
  const boardDepth = newDepths.get(rootId) ?? 1

  if (scope === "root") {
    if (boardDepth <= 0) return noChange(state)
    newDepths.set(rootId, boardDepth - 1)
    for (const id of columnCardIds) {
      newDepths.delete(id)
    }
    return {
      state: { ...state, foldDepths: newDepths },
      effects: [{ type: "FOLD_SET", depths: newDepths }],
    }
  }

  // scope === "card"
  if (targetIds.length === 0) return noChange(state)

  let changed = false
  for (const nodeId of targetIds) {
    const current = newDepths.get(nodeId)
    if (current === 0) continue
    if (current === undefined) {
      newDepths.set(nodeId, Math.max(0, boardDepth - 1))
      changed = true
    } else {
      newDepths.set(nodeId, Math.max(0, current - 1))
      changed = true
    }
  }
  if (!changed) return noChange(state)

  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

/**
 * Unfold node(s) — increase fold depth by 1.
 *
 * scope "root": increase root depth, clear all card-level depths.
 * scope "card": increase target node depths by 1 (clamped to MAX_FOLD_DEPTH).
 */
export function applyUnfoldNode(
  state: BoardNavState,
  scope: "root" | "card",
  rootId: string,
  targetIds: string[],
  columnCardIds: string[],
): ApplyResult {
  const newDepths = new Map(state.foldDepths)
  const boardDepth = newDepths.get(rootId) ?? 1

  if (scope === "root") {
    if (boardDepth >= MAX_FOLD_DEPTH) return noChange(state)
    newDepths.set(rootId, boardDepth + 1)
    for (const id of columnCardIds) {
      newDepths.delete(id)
    }
    return {
      state: { ...state, foldDepths: newDepths },
      effects: [{ type: "FOLD_SET", depths: newDepths }],
    }
  }

  // scope === "card"
  if (targetIds.length === 0) return noChange(state)

  let changed = false
  for (const nodeId of targetIds) {
    const current = newDepths.get(nodeId)
    const effectiveDepth = current ?? boardDepth
    if (effectiveDepth >= MAX_FOLD_DEPTH) continue
    if (current === undefined) {
      newDepths.set(nodeId, boardDepth + 1)
      changed = true
    } else {
      newDepths.set(nodeId, current + 1)
      changed = true
    }
  }
  if (!changed) return noChange(state)

  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

/**
 * Unfold recursively — set card depth to 999 and remove all descendant fold entries.
 *
 * descendantFoldIds is pre-computed by the caller: all foldDepths keys that are
 * descendants of cardId.
 */
export function applyUnfoldRecursive(state: BoardNavState, cardId: string, descendantFoldIds: string[]): ApplyResult {
  const newDepths = new Map(state.foldDepths)
  newDepths.set(cardId, 999)
  for (const id of descendantFoldIds) {
    newDepths.delete(id)
  }
  return {
    state: { ...state, foldDepths: newDepths },
    effects: [{ type: "FOLD_SET", depths: newDepths }],
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Return unchanged state with no effects. */
function noChange(state: BoardNavState): ApplyResult {
  return { state, effects: [] }
}

// =============================================================================
// State extraction helpers (for wiring into existing handlers)
// =============================================================================

/**
 * Create a minimal BoardNavState for testing or extraction from ActionCtx.
 */
export function createBoardNavState(overrides: Partial<BoardNavState> = {}): BoardNavState {
  return {
    cursorNodeId: null,
    cursorCardNodeId: null,
    cursorColumnNodeId: null,
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    hiddenNodeIds: new Set(),
    rootId: null,
    columnScrollAnchor: null,
    ...overrides,
  }
}
