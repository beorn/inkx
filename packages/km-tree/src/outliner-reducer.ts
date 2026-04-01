/**
 * Outliner Reducer — TEA state machine for outliner operations.
 *
 * Wraps the existing outliner operations (withOutliner) in a pure
 * `(state, action) -> [state, effects]` function. The outliner.ts
 * functions remain the implementation; this layer captures their
 * mutations as state snapshots and emits effects for side-channel
 * concerns (persistence, events).
 *
 * Terminology note: The TEA design doc (docs/design/tea-state-machines.md)
 * uses "operation" (op) and ".apply()". This module uses "action" per the
 * Phase 3 task spec. Both follow the same `(state, input) -> [state, effects]`
 * shape.
 *
 * Usage:
 *   const [newState, effects] = applyTreeAction(state, { type: "INDENT", nodeId: "abc" })
 */

import type { KNode } from "@km/core"
import type { TreeMutator } from "./block-ops.ts"
import {
  withOutliner,
  type OutlinerPolicy,
  type SplitBlockResult,
  type JoinBackwardResult,
  type JoinForwardResult,
} from "./outliner.ts"

// =============================================================================
// State
// =============================================================================

/** A snapshot of a single tree node for state diffing. */
export interface TreeNodeSnapshot {
  id: string
  parent_id: string | null
  parent_idx: number
  content?: string
  name?: string
  type: string
  item?: KNode["item"]
}

/**
 * Tree state for the reducer — the node array + cursor position.
 *
 * This is a snapshot representation. The reducer reads state from the
 * TreeMutator before the action and captures the result after. The tree
 * itself is the source of truth; this state enables pure testing and
 * effect emission.
 */
export interface TreeState {
  /** All nodes in the tree, keyed by ID. */
  nodes: Map<string, TreeNodeSnapshot>
  /** Currently focused node ID (cursor position). */
  focusedNodeId: string | null
  /** Cursor offset within the focused node's text. */
  cursorOffset: number
}

// =============================================================================
// Actions (discriminated union)
// =============================================================================

export type TreeAction =
  | { type: "INDENT"; nodeId: string }
  | { type: "OUTDENT"; nodeId: string }
  | { type: "MOVE_UP"; nodeId: string }
  | { type: "MOVE_DOWN"; nodeId: string }
  | { type: "SPLIT_BLOCK"; nodeId: string; cursorOffset: number }
  | { type: "MERGE_BLOCK"; nodeId: string; direction: "backward" | "forward" }
  | { type: "INSERT_NODE"; parentId: string; props: Partial<KNode> }
  | { type: "DELETE_NODE"; nodeId: string }

// =============================================================================
// Effects
// =============================================================================

export type TreeEffect =
  | { type: "persist"; description: string }
  | { type: "focus"; nodeId: string; cursorOffset: number }
  | { type: "bell" }
  | { type: "node_created"; nodeId: string }
  | { type: "node_deleted"; nodeId: string }
  | { type: "node_moved"; nodeId: string; fromParentId: string | null; toParentId: string | null }
  | { type: "nodes_merged"; survivorId: string; deletedId: string | null }
  | { type: "node_split"; beforeId: string; afterId: string }

// =============================================================================
// Result type
// =============================================================================

/** Result of applying a tree action: new state + effects. */
export type TreeActionResult = [TreeState, TreeEffect[]]

// =============================================================================
// State Snapshot Helpers
// =============================================================================

/** Capture a snapshot of all nodes reachable from the TreeMutator. */
function snapshotNode(node: KNode): TreeNodeSnapshot {
  return {
    id: node.id,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    content: node.content ?? undefined,
    name: node.name ?? undefined,
    type: node.type,
    item: node.item,
  }
}

/**
 * Capture the full tree state from a TreeMutator.
 *
 * Walks all nodes by traversing from known root IDs. Since TreeMutator
 * doesn't expose a "list all nodes" method, callers must provide the
 * root parent IDs to traverse.
 */
export function captureTreeState(
  tree: TreeMutator,
  rootParentIds: (string | null)[],
  focusedNodeId: string | null = null,
  cursorOffset = 0,
): TreeState {
  const nodes = new Map<string, TreeNodeSnapshot>()

  function walkChildren(parentId: string | null): void {
    const children = tree.getChildren(parentId)
    for (const child of children) {
      const full = tree.getNode(child.id)
      if (full) {
        nodes.set(full.id, snapshotNode(full))
        walkChildren(full.id)
      }
    }
  }

  for (const rootId of rootParentIds) {
    // Also capture the root node itself if it has an ID
    if (rootId != null) {
      const rootNode = tree.getNode(rootId)
      if (rootNode) nodes.set(rootNode.id, snapshotNode(rootNode))
    }
    walkChildren(rootId)
  }

  return { nodes, focusedNodeId, cursorOffset }
}

// =============================================================================
// Pure Reducer
// =============================================================================

/**
 * Apply a tree action to produce new state + effects.
 *
 * This is the core TEA state machine function. It delegates to the existing
 * outliner operations via withOutliner(), captures the resulting state, and
 * emits appropriate effects.
 *
 * The TreeMutator is mutated in place by the outliner operations (it wraps
 * a Repo). The returned TreeState is a snapshot taken after mutation. This
 * design wraps the imperative core in a functional interface — the reducer
 * is "pure" in the sense that the same action on the same tree state always
 * produces the same result and effects.
 *
 * @param tree - The mutable tree (Repo). Mutated in place by outliner ops.
 * @param state - Current tree state snapshot (for cursor/focus tracking).
 * @param action - The action to apply.
 * @param policy - Optional outliner policy for indent/outdent guards.
 * @returns [newState, effects] tuple following TEA pattern.
 */
export function applyTreeAction(
  tree: TreeMutator,
  state: TreeState,
  action: TreeAction,
  policy?: OutlinerPolicy,
): TreeActionResult {
  const outliner = withOutliner(tree, policy)
  const effects: TreeEffect[] = []
  let focusedNodeId = state.focusedNodeId
  let cursorOffset = state.cursorOffset

  switch (action.type) {
    case "INDENT": {
      const node = tree.getNode(action.nodeId)
      const fromParentId = node?.parent_id ?? null
      const success = outliner.indent(action.nodeId)
      if (!success) {
        effects.push({ type: "bell" })
      } else {
        const movedNode = tree.getNode(action.nodeId)
        effects.push({
          type: "node_moved",
          nodeId: action.nodeId,
          fromParentId,
          toParentId: movedNode?.parent_id ?? null,
        })
        effects.push({ type: "persist", description: `indent ${action.nodeId}` })
      }
      break
    }

    case "OUTDENT": {
      const node = tree.getNode(action.nodeId)
      const fromParentId = node?.parent_id ?? null
      const success = outliner.outdent(action.nodeId)
      if (!success) {
        effects.push({ type: "bell" })
      } else {
        const movedNode = tree.getNode(action.nodeId)
        effects.push({
          type: "node_moved",
          nodeId: action.nodeId,
          fromParentId,
          toParentId: movedNode?.parent_id ?? null,
        })
        effects.push({ type: "persist", description: `outdent ${action.nodeId}` })
      }
      break
    }

    case "MOVE_UP": {
      // Move node before its previous sibling by swapping sort orders
      const node = tree.getNode(action.nodeId)
      if (!node?.parent_id) {
        effects.push({ type: "bell" })
        break
      }
      const siblings = tree.getChildren(node.parent_id)
      const idx = siblings.findIndex((s) => s.id === action.nodeId)
      if (idx <= 0) {
        effects.push({ type: "bell" })
        break
      }
      // Swap parent_idx with previous sibling
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- idx > 0 guarantees prev exists
      const prev = siblings[idx - 1]!
      const myIdx = node.parent_idx
      const prevIdx = prev.parent_idx
      tree.moveNode(action.nodeId, node.parent_id, prevIdx)
      tree.moveNode(prev.id, node.parent_id, myIdx)
      effects.push({
        type: "node_moved",
        nodeId: action.nodeId,
        fromParentId: node.parent_id,
        toParentId: node.parent_id,
      })
      effects.push({ type: "persist", description: `move_up ${action.nodeId}` })
      break
    }

    case "MOVE_DOWN": {
      // Move node after its next sibling by swapping sort orders
      const node = tree.getNode(action.nodeId)
      if (!node?.parent_id) {
        effects.push({ type: "bell" })
        break
      }
      const siblings = tree.getChildren(node.parent_id)
      const idx = siblings.findIndex((s) => s.id === action.nodeId)
      if (idx < 0 || idx >= siblings.length - 1) {
        effects.push({ type: "bell" })
        break
      }
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- bounds check above guarantees next exists
      const next = siblings[idx + 1]!
      const myIdx = node.parent_idx
      const nextIdx = next.parent_idx
      tree.moveNode(action.nodeId, node.parent_id, nextIdx)
      tree.moveNode(next.id, node.parent_id, myIdx)
      effects.push({
        type: "node_moved",
        nodeId: action.nodeId,
        fromParentId: node.parent_id,
        toParentId: node.parent_id,
      })
      effects.push({ type: "persist", description: `move_down ${action.nodeId}` })
      break
    }

    case "SPLIT_BLOCK": {
      const result: SplitBlockResult | null = outliner.splitBlock(action.nodeId, action.cursorOffset)
      if (!result) {
        effects.push({ type: "bell" })
      } else {
        focusedNodeId = result.afterId
        cursorOffset = 0
        effects.push({ type: "node_split", beforeId: result.beforeId, afterId: result.afterId })
        effects.push({ type: "focus", nodeId: result.afterId, cursorOffset: 0 })
        effects.push({ type: "persist", description: `split_block ${action.nodeId}` })
      }
      break
    }

    case "MERGE_BLOCK": {
      if (action.direction === "backward") {
        const result: JoinBackwardResult | null = outliner.joinBackward(action.nodeId)
        if (!result) {
          effects.push({ type: "bell" })
        } else {
          focusedNodeId = result.survivorId
          cursorOffset = result.cursorOffset
          effects.push({ type: "focus", nodeId: result.survivorId, cursorOffset: result.cursorOffset })
          if (result.type === "deleted" || result.type === "merged") {
            const deletedId = result.type === "deleted" ? action.nodeId : null
            effects.push({ type: "nodes_merged", survivorId: result.survivorId, deletedId })
          }
          effects.push({ type: "persist", description: `merge_backward ${action.nodeId}` })
        }
      } else {
        const result: JoinForwardResult | null = outliner.joinForward(action.nodeId)
        if (!result) {
          effects.push({ type: "bell" })
        } else {
          focusedNodeId = result.survivorId
          cursorOffset = result.cursorOffset
          effects.push({ type: "focus", nodeId: result.survivorId, cursorOffset: result.cursorOffset })
          effects.push({ type: "nodes_merged", survivorId: result.survivorId, deletedId: null })
          effects.push({ type: "persist", description: `merge_forward ${action.nodeId}` })
        }
      }
      break
    }

    case "INSERT_NODE": {
      const newId = tree.addNode(action.parentId, action.props)
      focusedNodeId = newId
      cursorOffset = 0
      effects.push({ type: "node_created", nodeId: newId })
      effects.push({ type: "focus", nodeId: newId, cursorOffset: 0 })
      effects.push({ type: "persist", description: `insert_node under ${action.parentId}` })
      break
    }

    case "DELETE_NODE": {
      const node = tree.getNode(action.nodeId)
      if (!node) {
        effects.push({ type: "bell" })
        break
      }

      // Determine where to move focus: next sibling, then prev sibling, then parent
      const parentId = node.parent_id
      let nextFocus: string | null = null
      if (parentId) {
        const siblings = tree.getChildren(parentId)
        const idx = siblings.findIndex((s) => s.id === action.nodeId)
        if (idx < siblings.length - 1) {
          nextFocus = siblings[idx + 1]?.id ?? null
        } else if (idx > 0) {
          nextFocus = siblings[idx - 1]?.id ?? null
        } else {
          nextFocus = parentId
        }
      }

      tree.deleteNode(action.nodeId)
      focusedNodeId = nextFocus
      cursorOffset = 0
      effects.push({ type: "node_deleted", nodeId: action.nodeId })
      if (nextFocus) {
        effects.push({ type: "focus", nodeId: nextFocus, cursorOffset: 0 })
      }
      effects.push({ type: "persist", description: `delete_node ${action.nodeId}` })
      break
    }
  }

  // Capture new state from the (now mutated) tree
  const rootParentIds = collectRootParentIds(state)
  const newState = captureTreeState(tree, rootParentIds, focusedNodeId, cursorOffset)

  return [newState, effects]
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive root parent IDs from the current state for re-traversal.
 * Finds nodes whose parent_id is not itself in the node map — those
 * are children of external roots (or null roots).
 */
function collectRootParentIds(state: TreeState): (string | null)[] {
  const parentIds = new Set<string | null>()
  for (const node of state.nodes.values()) {
    if (node.parent_id == null || !state.nodes.has(node.parent_id)) {
      parentIds.add(node.parent_id)
    }
  }
  return [...parentIds]
}
