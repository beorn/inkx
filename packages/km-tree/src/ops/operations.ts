/**
 * Operations — Low-level atomic tree ops with inverse().
 *
 * SlateJS-inspired but ID-based (not path-based). Every operation is
 * invertible: apply(inverse(op)) restores the previous state. High-level
 * operations (split, mergeBackward) can emit these via an optional onOp
 * callback, enabling undo without reimplementing business logic.
 *
 * 7 operation types:
 *   insert_node, remove_node, set_node, move_node,
 *   split_node, merge_node, set_selection
 */

import { KNode } from "@km/core"
import type { TreeMutator } from "./block-ops.ts"
import type { Point } from "../selection.ts"

/** Re-export Point as Selection for the set_selection operation. */
export type Selection = Point

// =============================================================================
// Operation Types
// =============================================================================

export type Operation =
  | InsertNodeOperation
  | RemoveNodeOperation
  | SetNodeOperation
  | MoveNodeOperation
  | SplitNodeOperation
  | MergeNodeOperation
  | SetSelectionOperation

export interface InsertNodeOperation {
  type: "insert_node"
  parentId: string
  index: number
  node: Partial<KNode>
  newId: string
}

export interface RemoveNodeOperation {
  type: "remove_node"
  nodeId: string
  /** Full snapshot for restore on inverse. */
  snapshot: Partial<KNode>
  parentId: string
  index: number
}

export interface SetNodeOperation {
  type: "set_node"
  nodeId: string
  properties: Partial<KNode>
  oldProperties: Partial<KNode>
}

export interface MoveNodeOperation {
  type: "move_node"
  nodeId: string
  oldParentId: string
  oldIndex: number
  newParentId: string
  newIndex: number
}

export interface SplitNodeOperation {
  type: "split_node"
  /** Node being split (keeps text before offset). */
  nodeId: string
  /** Character offset in display text where the split happens. */
  offset: number
  /** ID assigned to the new node (text after offset). */
  newId: string
  /** Properties assigned to the new node. */
  properties: Partial<KNode>
}

export interface MergeNodeOperation {
  type: "merge_node"
  /** Node being merged (deleted after merge). */
  nodeId: string
  /** Node that absorbs the content (survivor). */
  targetId: string
  /** Length of target's text before merge (cursor boundary). */
  offset: number
}

export interface SetSelectionOperation {
  type: "set_selection"
  oldSelection: Selection | null
  newSelection: Selection | null
}

// =============================================================================
// Inverse
// =============================================================================

/**
 * Compute the inverse of an operation.
 * apply(inverse(op)) undoes the effect of apply(op).
 */
export function inverse(op: Operation): Operation {
  switch (op.type) {
    case "insert_node":
      return {
        type: "remove_node",
        nodeId: op.newId,
        snapshot: op.node,
        parentId: op.parentId,
        index: op.index,
      }

    case "remove_node":
      return {
        type: "insert_node",
        parentId: op.parentId,
        index: op.index,
        node: op.snapshot,
        newId: op.nodeId,
      }

    case "set_node":
      return {
        type: "set_node",
        nodeId: op.nodeId,
        properties: op.oldProperties,
        oldProperties: op.properties,
      }

    case "move_node":
      return {
        type: "move_node",
        nodeId: op.nodeId,
        oldParentId: op.newParentId,
        oldIndex: op.newIndex,
        newParentId: op.oldParentId,
        newIndex: op.oldIndex,
      }

    case "split_node":
      return {
        type: "merge_node",
        nodeId: op.newId,
        targetId: op.nodeId,
        offset: op.offset,
      }

    case "merge_node":
      return {
        type: "split_node",
        nodeId: op.targetId,
        offset: op.offset,
        newId: op.nodeId,
        properties: {},
      }

    case "set_selection":
      return {
        type: "set_selection",
        oldSelection: op.newSelection,
        newSelection: op.oldSelection,
      }
  }
}

// =============================================================================
// Apply
// =============================================================================

/**
 * Apply a single operation to a tree.
 *
 * For compound operations (split_node, merge_node), this function performs
 * the full sequence of mutations. The atomic sub-operations are not emitted
 * separately — split/merge are treated as single logical units.
 */
export function applyOperation(tree: TreeMutator, op: Operation): void {
  switch (op.type) {
    case "insert_node": {
      const node = { ...op.node, id: op.newId, parent_idx: op.index }
      tree.addNode(op.parentId, node)
      break
    }

    case "remove_node": {
      tree.deleteNode(op.nodeId)
      break
    }

    case "set_node": {
      tree.updateNode(op.nodeId, op.properties)
      break
    }

    case "move_node": {
      tree.moveNode(op.nodeId, op.newParentId, op.newIndex)
      break
    }

    case "split_node": {
      // Split is compound: truncate original, insert new node with remainder
      const node = tree.getNode(op.nodeId)
      if (!node) throw new Error(`split_node: node not found: ${op.nodeId}`)

      const text = KNode.string(node)
      const beforeText = text.slice(0, op.offset)
      const afterText = text.slice(op.offset)

      // Update original with text before offset
      tree.updateNode(op.nodeId, { content: KNode.setString(node, beforeText) })

      // Create new sibling with text after offset
      const parentId = node.parent_id
      if (!parentId) throw new Error(`split_node: node has no parent: ${op.nodeId}`)

      tree.addNode(parentId, {
        ...op.properties,
        id: op.newId,
        content: KNode.setString(node, afterText),
        parent_idx: (node.parent_idx ?? 0) + 1,
      })
      break
    }

    case "merge_node": {
      // Merge: append source text to target, delete source
      const source = tree.getNode(op.nodeId)
      const target = tree.getNode(op.targetId)
      if (!source || !target) throw new Error(`merge_node: node not found`)

      const targetText = KNode.string(target)
      const sourceText = KNode.string(source)
      const mergedText = targetText + sourceText

      tree.updateNode(op.targetId, { content: KNode.setString(target, mergedText) })
      tree.deleteNode(op.nodeId)
      break
    }

    case "set_selection": {
      // Selection is an effect — no tree mutation needed.
      // The caller (undo/redo) uses the selection to restore cursor.
      break
    }
  }
}
