/**
 * Board Reducer — Pure State Machine
 *
 * Pure functions following TEA shape: Board.apply(state, op) → [state, effects]
 *
 * Operations are data (discriminated unions). Effects are data (discriminated unions).
 * State transitions are pure functions. The runtime applies effects.
 *
 * Phase 1a: Navigation operations (cursor, fold, page jump).
 * Phase 2: Edit operations (indent, outdent, insert, delete, move, toggle status).
 *   Edit ops produce effects that instruct the runtime to perform repo mutations.
 *   The reducer itself remains pure — no side effects, no async.
 *
 * See docs/design/tea-state-machines.md for the full TEA vision.
 */

import type { KNode, TaskStatus } from "@km/core"

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
  cursor: string | null
  cursorCardNodeId: string | null
  cursorColumnNodeId: string | null

  foldDepths: Map<string, number>
  collapsedNodes: Set<string>

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
 * Navigation effects are handled directly by the board store.
 * Edit effects instruct the runtime to perform repo mutations.
 */
export type BoardEffect =
  // Navigation effects
  | { type: "SELECT"; nodeId: string }
  | { type: "FOLD_SET"; depths: Map<string, number> }
  | { type: "SCROLL_ANCHOR_CLEAR" }
  // Edit effects — instruct the runtime to perform repo mutations
  | { type: "REPO_MOVE_NODE"; nodeId: string; newParentId: string; sortOrder: number }
  | { type: "REPO_ADD_NODE"; parentId: string; node: Partial<KNode>; selectAfter: boolean }
  | { type: "REPO_DELETE_NODE"; nodeId: string }
  | { type: "REPO_UPDATE_NODE"; nodeId: string; updates: Partial<KNode> }
  // UI effects
  | { type: "INLINE_EDIT"; nodeId: string; blockIndex: number }
  | { type: "RENDER_FLUSH" }
  | { type: "CLEAR_SELECTION" }
  // Undo effects — signal the runtime to manage undo batching
  | { type: "UNDO_SET_CURSOR"; nodeId: string | null }
  | { type: "UNDO_START_BATCH"; label: string }
  | { type: "UNDO_END_BATCH" }

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

// =============================================================================
// Edit Operations — Phase 2
//
// Edit operations produce effects that instruct the runtime to perform repo
// mutations. The reducer itself remains pure. The caller pre-computes all
// needed information (sibling lists, sort orders, etc.) so the reducer
// does only state transitions and effect generation.
// =============================================================================

/**
 * Context for an indent operation — pre-computed by the caller.
 * The reducer uses this to generate the correct REPO_MOVE_NODE effect.
 */
export interface IndentContext {
  /** Node being indented */
  nodeId: string
  /** Previous sibling to nest under */
  newParentId: string
  /** Sort order within new parent (after last child) */
  sortOrder: number
}

/**
 * Context for an outdent operation — pre-computed by the caller.
 */
export interface OutdentContext {
  /** Node being outdented */
  nodeId: string
  /** Grandparent to move to */
  newParentId: string
  /** Sort order within grandparent (after parent) */
  sortOrder: number
}

/**
 * Context for inserting a new node — pre-computed by the caller.
 */
export interface InsertNodeContext {
  /** Parent to add the node under */
  parentId: string
  /** Node properties for the new node */
  node: Partial<KNode>
  /** Whether to enter inline edit after insert */
  enterEdit: boolean
}

/**
 * Context for deleting a node — pre-computed by the caller.
 */
export interface DeleteNodeContext {
  /** IDs of nodes to delete (with descendants to be deleted by runtime) */
  nodeIds: string[]
  /** Pre-computed cursor target after deletion (next/prev sibling or column header) */
  cursorTarget: string | null
}

/**
 * Context for moving a node up or down within its parent.
 */
export interface MoveNodeContext {
  /** Node being moved */
  nodeId: string
  /** Parent ID (column) */
  parentId: string
  /** New sort order at the target position */
  sortOrder: number
}

/**
 * Context for toggling task status — pre-computed by the caller.
 */
export interface ToggleStatusContext {
  /** Node ID to update (resolved through embeds if needed) */
  nodeId: string
  /** The next status to apply */
  nextStatus: TaskStatus
  /** The corresponding marker string */
  marker: string
  /** Full item data for the update (preserves list marker, etc.) */
  itemUpdate: Partial<KNode>
}

export type BoardEditOp =
  | { type: "INDENT_NODE"; nodes: IndentContext[] }
  | { type: "OUTDENT_NODE"; nodes: OutdentContext[] }
  | { type: "INSERT_NODE"; context: InsertNodeContext }
  | { type: "DELETE_NODE"; context: DeleteNodeContext }
  | { type: "TOGGLE_TASK_STATUS"; nodes: ToggleStatusContext[] }
  | { type: "MOVE_NODE_UP"; nodes: MoveNodeContext[] }
  | { type: "MOVE_NODE_DOWN"; nodes: MoveNodeContext[] }

/**
 * Combined operation type — navigation or edit.
 */
export type BoardOp = BoardNavOp | BoardEditOp

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
// Board.apply — combined dispatcher (navigation + edit)
// =============================================================================

/** Type guard: is the operation a navigation op? */
function isNavOp(op: BoardOp): op is BoardNavOp {
  return NAV_OP_TYPES.has(op.type)
}

const NAV_OP_TYPES = new Set([
  "BLOCK_NAV",
  "OUTLINE_NAV",
  "SELECT",
  "PAGE_JUMP",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
  "TOGGLE_FOLD",
  "FOLD_NODE",
  "UNFOLD_NODE",
  "UNFOLD_RECURSIVE",
])

/**
 * Apply any board operation (navigation or edit) to board state.
 * Pure function: no side effects, no async.
 *
 * @returns New state + effects for the runtime to execute
 */
export function applyBoard(state: BoardNavState, op: BoardOp): ApplyResult {
  if (isNavOp(op)) {
    return applyNavigation(state, op)
  }
  return applyEdit(state, op)
}

// =============================================================================
// Edit operations — produce effects for the runtime
// =============================================================================

/**
 * Apply an edit operation to board state.
 * Edit ops are pure: they update cursor/selection state and emit effects
 * that the runtime interprets to perform repo mutations.
 */
function applyEdit(state: BoardNavState, op: BoardEditOp): ApplyResult {
  switch (op.type) {
    case "INDENT_NODE":
      return applyIndentNode(state, op.nodes)
    case "OUTDENT_NODE":
      return applyOutdentNode(state, op.nodes)
    case "INSERT_NODE":
      return applyInsertNode(state, op.context)
    case "DELETE_NODE":
      return applyDeleteNode(state, op.context)
    case "TOGGLE_TASK_STATUS":
      return applyToggleTaskStatus(state, op.nodes)
    case "MOVE_NODE_UP":
      return applyMoveNode(state, op.nodes, "Move up")
    case "MOVE_NODE_DOWN":
      return applyMoveNode(state, op.nodes, "Move down")
    default: {
      const _exhaustive: never = op
      throw new Error(`Unhandled BoardEditOp: ${(_exhaustive as { type: string }).type}`)
    }
  }
}

/**
 * Indent node(s) — reparent under previous sibling.
 *
 * Emits REPO_MOVE_NODE effects for each node (the runtime applies them).
 * Clears multi-selection after indent (tree structure changed).
 */
function applyIndentNode(state: BoardNavState, nodes: IndentContext[]): ApplyResult {
  if (nodes.length === 0) return noChange(state)

  const effects: BoardEffect[] = [{ type: "UNDO_SET_CURSOR", nodeId: state.cursor }]

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_START_BATCH", label: "Indent nodes" })
  }

  for (const ctx of nodes) {
    effects.push({
      type: "REPO_MOVE_NODE",
      nodeId: ctx.nodeId,
      newParentId: ctx.newParentId,
      sortOrder: ctx.sortOrder,
    })
  }

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_END_BATCH" })
  }

  // Cursor follows the first indented node
  const firstNodeId = nodes[0]!.nodeId
  effects.push({ type: "SELECT", nodeId: firstNodeId })
  effects.push({ type: "CLEAR_SELECTION" })

  return {
    state: { ...state, cursor: firstNodeId },
    effects,
  }
}

/**
 * Outdent node(s) — reparent as sibling of parent.
 *
 * Same pattern as indent: emits REPO_MOVE_NODE effects.
 */
function applyOutdentNode(state: BoardNavState, nodes: OutdentContext[]): ApplyResult {
  if (nodes.length === 0) return noChange(state)

  const effects: BoardEffect[] = [{ type: "UNDO_SET_CURSOR", nodeId: state.cursor }]

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_START_BATCH", label: "Outdent nodes" })
  }

  for (const ctx of nodes) {
    effects.push({
      type: "REPO_MOVE_NODE",
      nodeId: ctx.nodeId,
      newParentId: ctx.newParentId,
      sortOrder: ctx.sortOrder,
    })
  }

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_END_BATCH" })
  }

  const firstNodeId = nodes[0]!.nodeId
  effects.push({ type: "SELECT", nodeId: firstNodeId })
  effects.push({ type: "CLEAR_SELECTION" })

  return {
    state: { ...state, cursor: firstNodeId },
    effects,
  }
}

/**
 * Insert a new node — add child or sibling.
 *
 * Emits REPO_ADD_NODE effect. Optionally enters inline edit mode.
 */
function applyInsertNode(state: BoardNavState, context: InsertNodeContext): ApplyResult {
  const effects: BoardEffect[] = [
    { type: "UNDO_SET_CURSOR", nodeId: state.cursor },
    { type: "REPO_ADD_NODE", parentId: context.parentId, node: context.node, selectAfter: true },
  ]

  if (context.enterEdit) {
    effects.push({ type: "RENDER_FLUSH" })
  }

  // Note: cursor will be updated by the runtime after the node is created
  // (since we don't know the new node ID in the pure reducer).
  return {
    state,
    effects,
  }
}

/**
 * Delete node(s) — remove from tree.
 *
 * Emits REPO_DELETE_NODE effects (bottom-up order).
 * Moves cursor to pre-computed target.
 */
function applyDeleteNode(state: BoardNavState, context: DeleteNodeContext): ApplyResult {
  if (context.nodeIds.length === 0) return noChange(state)

  const effects: BoardEffect[] = [{ type: "UNDO_SET_CURSOR", nodeId: state.cursor }]

  effects.push({ type: "UNDO_START_BATCH", label: "Delete" })

  // Delete bottom-up (reversed) to avoid index invalidation
  for (const nodeId of [...context.nodeIds].reverse()) {
    effects.push({ type: "REPO_DELETE_NODE", nodeId })
  }

  effects.push({ type: "UNDO_END_BATCH" })
  effects.push({ type: "CLEAR_SELECTION" })

  // Move cursor to pre-computed target
  const cursorTarget = context.cursorTarget ?? state.cursor
  if (cursorTarget) {
    effects.push({ type: "SELECT", nodeId: cursorTarget })
  }

  return {
    state: { ...state, cursor: cursorTarget },
    effects,
  }
}

/**
 * Toggle task status on one or more nodes.
 *
 * Emits REPO_UPDATE_NODE effects for each node.
 * Selection is preserved (status is an in-place modification).
 */
function applyToggleTaskStatus(state: BoardNavState, nodes: ToggleStatusContext[]): ApplyResult {
  if (nodes.length === 0) return noChange(state)

  const effects: BoardEffect[] = [{ type: "UNDO_SET_CURSOR", nodeId: state.cursor }]

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_START_BATCH", label: "Toggle status" })
  }

  for (const ctx of nodes) {
    effects.push({
      type: "REPO_UPDATE_NODE",
      nodeId: ctx.nodeId,
      updates: ctx.itemUpdate,
    })
  }

  if (nodes.length > 1) {
    effects.push({ type: "UNDO_END_BATCH" })
  }

  // Re-select to trigger UI update (selection preserved)
  if (state.cursor) {
    effects.push({ type: "SELECT", nodeId: state.cursor })
  }

  return { state, effects }
}

/**
 * Move node(s) up or down within their parent column.
 *
 * Emits REPO_MOVE_NODE effects with pre-computed sort orders.
 * Cursor follows the moved node(s).
 */
function applyMoveNode(state: BoardNavState, nodes: MoveNodeContext[], batchLabel: string): ApplyResult {
  if (nodes.length === 0) return noChange(state)

  const effects: BoardEffect[] = [{ type: "UNDO_SET_CURSOR", nodeId: state.cursor }]

  effects.push({ type: "UNDO_START_BATCH", label: batchLabel })

  for (const ctx of nodes) {
    effects.push({
      type: "REPO_MOVE_NODE",
      nodeId: ctx.nodeId,
      newParentId: ctx.parentId,
      sortOrder: ctx.sortOrder,
    })
  }

  effects.push({ type: "UNDO_END_BATCH" })

  // Cursor follows the moved node
  if (state.cursor) {
    effects.push({ type: "SELECT", nodeId: state.cursor })
  }

  return { state, effects }
}

// =============================================================================
// Pure navigation functions
// =============================================================================

/** Basic cursor move — the fast-path SELECT. */
export function applySelect(state: BoardNavState, nodeId: string): ApplyResult {
  return {
    state: { ...state, cursor: nodeId },
    effects: [{ type: "SELECT", nodeId }],
  }
}

/**
 * Unified list navigation — move cursor through an ordered list of IDs.
 *
 * All index-based navigation (block nav, outline nav, page jump) reduces to:
 * given a list of IDs and a current position, compute the next position.
 *
 * @param items - Ordered list of navigable IDs (blocks, descendants, cards)
 * @param direction - "forward" (+1) or "backward" (-1)
 * @param opts.step - How many items to jump (default: 1)
 * @param opts.currentIndex - Override index lookup (default: indexOf cursor)
 * @param opts.clearScrollAnchor - Also clear columnScrollAnchor (for page jump)
 */
export function applyListNav(
  state: BoardNavState,
  items: string[],
  direction: "forward" | "backward",
  opts?: { step?: number; currentIndex?: number; clearScrollAnchor?: boolean },
): ApplyResult {
  if (items.length === 0) return noChange(state)

  const step = opts?.step ?? 1
  const currentIdx = opts?.currentIndex ?? (state.cursor ? items.indexOf(state.cursor) : -1)
  if (currentIdx < 0) return noChange(state)

  const targetIdx =
    direction === "forward" ? Math.min(items.length - 1, currentIdx + step) : Math.max(0, currentIdx - step)

  if (targetIdx === currentIdx) return noChange(state)

  const targetId = items[targetIdx]
  if (!targetId) return noChange(state)

  if (opts?.clearScrollAnchor) {
    const newState: BoardNavState = {
      ...state,
      cursor: targetId,
      columnScrollAnchor: null,
    }
    return {
      state: newState,
      effects: [{ type: "SCROLL_ANCHOR_CLEAR" }, { type: "SELECT", nodeId: targetId }],
    }
  }

  return applySelect(state, targetId)
}

// ---------------------------------------------------------------------------
// Thin wrappers — preserve call-site readability & the BoardNavOp dispatch
// ---------------------------------------------------------------------------

/**
 * Spatial block navigation (J/K — next/previous visible block in column).
 * Delegates to applyListNav.
 */
export function applyBlockNav(state: BoardNavState, direction: "up" | "down", visibleBlocks: string[]): ApplyResult {
  if (!state.cursor) return noChange(state)
  return applyListNav(state, visibleBlocks, direction === "down" ? "forward" : "backward")
}

/**
 * Outline mode prev/next sub-item navigation.
 * Delegates to applyListNav.
 */
export function applyOutlineNav(
  state: BoardNavState,
  direction: "prev" | "next",
  descendantIds: string[],
): ApplyResult {
  if (!state.cursor) return noChange(state)
  return applyListNav(state, descendantIds, direction === "next" ? "forward" : "backward")
}

/**
 * Page jump — move cursor by pageSize cards in the given direction.
 * Delegates to applyListNav with step=pageSize and clearScrollAnchor.
 */
export function applyPageJump(
  state: BoardNavState,
  direction: "up" | "down",
  cardIds: string[],
  currentCardIndex: number,
  pageSize: number,
): ApplyResult {
  return applyListNav(state, cardIds, direction === "down" ? "forward" : "backward", {
    step: pageSize,
    currentIndex: currentCardIndex,
    clearScrollAnchor: true,
  })
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
 * Create a minimal BoardNavState for testing or extraction from OpCtx.
 */
export function createBoardNavState(overrides: Partial<BoardNavState> = {}): BoardNavState {
  return {
    cursor: null,
    cursorCardNodeId: null,
    cursorColumnNodeId: null,
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    rootId: null,
    columnScrollAnchor: null,
    ...overrides,
  }
}
