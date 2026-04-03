/**
 * Outliner — centralized outliner behavior composition.
 *
 * Implements the semantic intents from docs/design/outliner-spec.md:
 * indent, outdent, splitBlock, joinBackward, joinForward.
 *
 * Each operation checks guards from the spec and returns the mutation result
 * or null (no-op). Policy points are configurable per product.
 *
 * Usage:
 *   const outliner = withOutliner(repo)
 *   const result = outliner.indent(nodeId)
 *   if (!result) bell() // guard blocked the operation
 */

import { KNode } from "@km/core"
import {
  type TreeMutator,
  type SplitResult,
  type MergeResult,
  split,
  mergeBackward,
  mergeForward,
  degrade,
} from "./block-ops.ts"
import { midpoint } from "./sort-utils.ts"

// =============================================================================
// Types
// =============================================================================

/** Cursor context computed from a node's position in the tree. */
export interface OutlinerContext {
  /** No previous sibling */
  isFirstChild: boolean
  /** No next sibling */
  isLastChild: boolean
  /** Both first and last (only child) */
  isOnlyChild: boolean
  /** Node has child nodes */
  hasChildren: boolean
  /** No text content */
  isEmpty: boolean
  /** Top-level node (parent has no parent) */
  isRoot: boolean
  /** Policy: node type supports indent/outdent */
  isIndentable: boolean
}

/** Product-specific policy configuration. */
export interface OutlinerPolicy {
  /** Whether a node can be indented/outdented. Default: KNode.isItem(node) */
  isIndentable?: (node: KNode) => boolean
  /** Whether children are visible (not collapsed). Default: always true */
  childrenVisible?: (nodeId: string) => boolean
}

/** Result of a splitBlock operation. */
export interface SplitBlockResult {
  /** ID of the node that retains content before cursor */
  beforeId: string
  /** ID of the new node (content after cursor, or empty) */
  afterId: string
}

/** Result of a joinBackward operation. */
export interface JoinBackwardResult {
  /** What happened */
  type: "degraded" | "deleted" | "merged" | "reparented" | "outdented"
  /** ID of the node the cursor should land on */
  survivorId: string
  /** Cursor offset in the survivor's text */
  cursorOffset: number
  /** Changes applied (for degradation) */
  changes?: Partial<KNode>
}

/** Result of a joinForward operation. */
export interface JoinForwardResult {
  /** ID of the surviving node */
  survivorId: string
  /** Cursor offset (unchanged — at the original end position) */
  cursorOffset: number
}

// =============================================================================
// Context Builder
// =============================================================================

/**
 * Build an OutlinerContext for a node.
 *
 * Computes all the boolean context variables the spec uses for guard checks.
 */
export function createOutlinerContext(
  tree: TreeMutator,
  nodeId: string,
  policy?: OutlinerPolicy,
): OutlinerContext | null {
  const node = tree.getNode(nodeId)
  if (!node) return null

  const parentId = node.parent_id
  const siblings = parentId ? tree.getChildren(parentId) : []
  const myIndex = siblings.findIndex((s) => s.id === nodeId)
  const children = tree.getChildren(nodeId)
  const text = KNode.string(node)

  const isIndentable = policy?.isIndentable ? policy.isIndentable(node) : KNode.isItem(node)

  // isRoot: parent has no grandparent (node is direct child of a top-level container).
  // In km storage, root nodes have parent_id "." (not null), so we check for both.
  const parent = parentId ? tree.getNode(parentId) : null
  const parentPid = parent?.parent_id
  const isRoot = !parentPid || parentPid === "."

  return {
    isFirstChild: myIndex <= 0,
    isLastChild: myIndex >= siblings.length - 1,
    isOnlyChild: siblings.length <= 1,
    hasChildren: children.length > 0,
    isEmpty: text.length === 0,
    isRoot,
    isIndentable,
  }
}

// =============================================================================
// Outliner Factory
// =============================================================================

export interface Outliner {
  /** Indent: reparent under previous sibling. Returns true on success, false = no-op. */
  indent(nodeId: string): boolean
  /** Outdent: reparent as sibling of parent. Returns true on success, false = no-op. */
  outdent(nodeId: string): boolean
  /** Split at cursor. Returns result or null if no-op. */
  splitBlock(nodeId: string, cursorOffset: number): SplitBlockResult | null
  /** Backspace at start. Returns result or null if no-op. */
  joinBackward(nodeId: string): JoinBackwardResult | null
  /** Delete at end. Returns result or null if no-op. */
  joinForward(nodeId: string): JoinForwardResult | null
  /** Build context for a node (useful for callers to inspect guards). */
  context(nodeId: string): OutlinerContext | null
}

/**
 * Create an outliner that centralizes all outliner operations.
 *
 * Each method checks spec guards and delegates to block-ops for tree mutation.
 * Returns null/false when a guard blocks the operation (caller should bell).
 */
export function withOutliner(tree: TreeMutator, policy?: OutlinerPolicy): Outliner {
  function ctx(nodeId: string): OutlinerContext | null {
    return createOutlinerContext(tree, nodeId, policy)
  }

  return {
    context: ctx,

    indent(nodeId: string): boolean {
      const c = ctx(nodeId)
      if (!c) return false

      // Guard: must be indentable
      if (!c.isIndentable) return false
      // Guard: must have a previous sibling to nest under
      if (c.isFirstChild) return false

      const node = tree.getNode(nodeId)
      if (!node?.parent_id) return false

      const siblings = tree.getChildren(node.parent_id)
      const myIndex = siblings.findIndex((s) => s.id === nodeId)
      if (myIndex <= 0) return false

      const prevSibling = siblings[myIndex - 1]
      if (!prevSibling) return false

      // Reparent as last child of previous sibling
      const newParentChildren = tree.getChildren(prevSibling.id)
      const lastChild = newParentChildren[newParentChildren.length - 1]
      const newSortOrder = lastChild ? (lastChild.parent_idx ?? 0) + 1 : 0

      tree.moveNode(nodeId, prevSibling.id, newSortOrder)
      return true
    },

    outdent(nodeId: string): boolean {
      const c = ctx(nodeId)
      if (!c) return false

      // Guard: must be indentable
      if (!c.isIndentable) return false
      // Guard: must not be root (needs grandparent)
      if (c.isRoot) return false

      const node = tree.getNode(nodeId)
      if (!node?.parent_id) return false

      const parent = tree.getNode(node.parent_id)
      if (!parent?.parent_id) return false

      // Reparent as sibling after parent (at grandparent level)
      const grandparentChildren = tree.getChildren(parent.parent_id)
      const parentIndex = grandparentChildren.findIndex((s) => s.id === parent.id)
      const parentIdx = parent.parent_idx ?? 0

      let newSortOrder: number
      if (parentIndex >= grandparentChildren.length - 1) {
        newSortOrder = parentIdx + 1
      } else {
        const nextSibling = grandparentChildren[parentIndex + 1]
        newSortOrder = midpoint(parentIdx, nextSibling?.parent_idx ?? parentIdx + 2)
      }

      tree.moveNode(nodeId, parent.parent_id, newSortOrder)
      return true
    },

    splitBlock(nodeId: string, cursorOffset: number): SplitBlockResult | null {
      const node = tree.getNode(nodeId)
      if (!node?.parent_id) return null

      const text = KNode.string(node)
      const children = tree.getChildren(nodeId)
      const hasChildren = children.length > 0
      const childrenVisible = policy?.childrenVisible ? policy.childrenVisible(nodeId) : true
      const cursorAtEnd = cursorOffset >= text.length
      const isEmpty = text.length === 0

      // isEmpty: create sibling after (don't split empty)
      if (isEmpty) {
        return createSiblingAfter(tree, node)
      }

      // cursorAtEnd + hasChildren + childrenVisible: create first child
      if (cursorAtEnd && hasChildren && childrenVisible) {
        return createFirstChild(tree, node)
      }

      // cursorAtEnd + hasChildren + !childrenVisible: create sibling after collapsed subtree
      // cursorAtEnd + !hasChildren: create sibling after
      if (cursorAtEnd) {
        return createSiblingAfter(tree, node)
      }

      // cursorAtStart: create empty sibling before, content stays on current
      if (cursorOffset <= 0) {
        return createSiblingBefore(tree, node)
      }

      // cursorAtMiddle: split at cursor using block-ops
      const result: SplitResult = split(tree, nodeId, cursorOffset)
      return { beforeId: result.beforeId, afterId: result.afterId }
    },

    joinBackward(nodeId: string): JoinBackwardResult | null {
      const node = tree.getNode(nodeId)
      if (!node) return null

      // Step 1-3: Degradation ladder (strip traits before merging)
      const degradation = degrade(node, tree, nodeId)
      if (degradation) {
        tree.updateNode(nodeId, degradation)
        return {
          type: "degraded",
          survivorId: nodeId,
          cursorOffset: 0,
          changes: degradation,
        }
      }

      // Node is a plain paragraph — proceed with merge/structural operations
      const text = KNode.string(node)
      const isEmpty = text.length === 0
      const children = tree.getChildren(nodeId)
      const parentId = node.parent_id

      if (!parentId) return null

      const siblings = tree.getChildren(parentId)
      const myIndex = siblings.findIndex((s) => s.id === nodeId)

      if (myIndex > 0) {
        // Has previous sibling
        const prev = siblings[myIndex - 1]
        if (!prev) return null
        const prevText = KNode.string(prev)
        const prevChildren = tree.getChildren(prev.id)

        // Step 4: empty + no children → delete, cursor to prev
        if (isEmpty && children.length === 0) {
          tree.deleteNode(nodeId)
          return {
            type: "deleted",
            survivorId: prev.id,
            cursorOffset: prevText.length,
          }
        }

        // Step 5: has content + prev is childless → prepend prev content, delete prev
        if (prevChildren.length === 0) {
          const result: MergeResult | null = mergeBackward(tree, nodeId)
          if (!result) return null
          return {
            type: "merged",
            survivorId: result.survivorId,
            cursorOffset: result.cursorOffset,
          }
        }

        // Step 6: has content + prev has children → move as last child of prev
        const result: MergeResult | null = mergeBackward(tree, nodeId)
        if (!result) return null
        return {
          type: "reparented",
          survivorId: result.survivorId,
          cursorOffset: result.cursorOffset,
        }
      }

      // Step 7: No previous sibling → outdent (move to parent's level)
      const parent = tree.getNode(parentId)
      if (!parent?.parent_id) return null

      const result: MergeResult | null = mergeBackward(tree, nodeId)
      if (!result) return null
      return {
        type: "outdented",
        survivorId: result.survivorId,
        cursorOffset: result.cursorOffset,
      }
    },

    joinForward(nodeId: string): JoinForwardResult | null {
      const node = tree.getNode(nodeId)
      if (!node?.parent_id) return null

      const siblings = tree.getChildren(node.parent_id)
      const myIndex = siblings.findIndex((s) => s.id === nodeId)
      if (myIndex < 0 || myIndex >= siblings.length - 1) return null

      const next = siblings[myIndex + 1]
      if (!next) return null

      const nextChildren = tree.getChildren(next.id)

      // Next has children → no-op (conservative, per spec)
      if (nextChildren.length > 0) return null

      const text = KNode.string(node)
      const result: MergeResult | null = mergeForward(tree, nodeId)
      if (!result) return null

      return {
        survivorId: result.survivorId,
        cursorOffset: text.length,
      }
    },
  }
}

// =============================================================================
// Tree Query Helpers
// =============================================================================

/** Find a node's index among its siblings. Returns -1 if not found. */
function siblingIndex(tree: TreeMutator, nodeId: string, parentId: string): number {
  return tree.getChildren(parentId).findIndex((s) => s.id === nodeId)
}

// =============================================================================
// Split Helpers
// =============================================================================

/** Create an empty sibling before the current node. */
function createSiblingBefore(tree: TreeMutator, node: KNode): SplitBlockResult {
  const parentId = node.parent_id!
  const siblings = tree.getChildren(parentId)
  const idx = siblingIndex(tree, node.id, parentId)
  const myIdx = node.parent_idx ?? 0
  const prevIdx = (idx > 0 ? siblings[idx - 1]?.parent_idx : undefined) ?? myIdx - 1

  const newId = tree.addNode(parentId, {
    ...KNode.extractProps(node),
    content: "",
    parent_idx: midpoint(prevIdx, myIdx),
  })
  return { beforeId: newId, afterId: node.id }
}

/** Create an empty sibling after the current node. */
function createSiblingAfter(tree: TreeMutator, node: KNode): SplitBlockResult {
  const parentId = node.parent_id!
  const siblings = tree.getChildren(parentId)
  const idx = siblingIndex(tree, node.id, parentId)
  const myIdx = node.parent_idx ?? 0
  const nextIdx = (idx < siblings.length - 1 ? siblings[idx + 1]?.parent_idx : undefined) ?? myIdx + 1

  const newId = tree.addNode(parentId, {
    ...KNode.extractProps(node),
    content: "",
    parent_idx: midpoint(myIdx, nextIdx),
  })
  return { beforeId: node.id, afterId: newId }
}

/** Create an empty first child of the current node. */
function createFirstChild(tree: TreeMutator, node: KNode): SplitBlockResult {
  const firstChild = tree.getChildren(node.id)[0]
  const firstIdx = firstChild?.parent_idx ?? 1
  const sortOrder = firstIdx > 0 ? firstIdx / 2 : firstIdx - 1

  const newId = tree.addNode(node.id, {
    ...KNode.extractProps(node),
    content: "",
    parent_idx: sortOrder,
  })
  return { beforeId: node.id, afterId: newId }
}
