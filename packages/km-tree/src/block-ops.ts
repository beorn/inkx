/**
 * Block Operations - Split and Merge
 *
 * Pure tree operations for outline editing:
 * - splitNode: Split a node's content at cursor position into two siblings
 * - mergeWithPrevious: Merge a node with its previous sibling (Backspace at start)
 *
 * These operate on a minimal TreeMutator interface that Repo satisfies.
 * No UI, no rendering - just tree structure manipulation.
 */

import type { KNode } from "@km/core"

// =============================================================================
// Minimal Interface (subset of Repo that these operations need)
// =============================================================================

/**
 * Minimal tree mutation interface.
 * Repo satisfies this without any adapter code.
 */
export interface TreeMutator {
  getNode(id: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  addNode(parentId: string | null, node: Partial<KNode>): string
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
  deleteNode(id: string): void
}

// =============================================================================
// Result Types
// =============================================================================

export interface SplitResult {
  /** ID of the original node (now contains text before cursor) */
  beforeId: string
  /** ID of the new node (contains text after cursor) */
  afterId: string
}

export interface MergeResult {
  /** ID of the surviving node (contains merged content) */
  survivorId: string
  /** Cursor offset in the merged content (where the old boundary was) */
  cursorOffset: number
}

// =============================================================================
// Split Node
// =============================================================================

/**
 * Split a node's content at a cursor offset, creating a new sibling after it.
 *
 * The original node keeps text before the cursor.
 * A new sibling is created with text after the cursor.
 * Children of the original node are moved to the new sibling.
 *
 * Split rules (from the Enter rules table):
 * - Content at start: insert empty sibling before
 * - Content at middle: split into two siblings, children move to new node
 * - Content at end: new empty sibling after
 *
 * @param tree - Tree mutator (Repo satisfies this)
 * @param nodeId - ID of the node to split
 * @param offset - Character offset in the node's display text (name or content)
 * @returns SplitResult with IDs of the two resulting nodes
 */
export function splitNode(tree: TreeMutator, nodeId: string, offset: number): SplitResult {
  const node = tree.getNode(nodeId)
  if (!node) throw new Error(`splitNode: node not found: ${nodeId}`)

  const parentId = node.parent_id
  if (!parentId) throw new Error(`splitNode: node has no parent: ${nodeId}`)

  const text = getNodeText(node)
  const clampedOffset = Math.max(0, Math.min(offset, text.length))

  const beforeText = text.slice(0, clampedOffset)
  const afterText = text.slice(clampedOffset)

  // Compute sort order: place new node right after the current one
  const siblings = tree.getChildren(parentId)
  const currentIndex = siblings.findIndex((s) => s.id === nodeId)
  const currentIdx = node.parent_idx ?? 0
  const nextSibling = siblings[currentIndex + 1]
  const nextIdx = nextSibling?.parent_idx ?? currentIdx + 1
  const newSortOrder = (currentIdx + nextIdx) / 2

  // Create new sibling with text after cursor
  const newNode: Partial<KNode> = {
    type: node.type,
    content: setNodeText(node, afterText),
    parent_idx: newSortOrder,
  }

  // Inherit task properties if the original is a task
  if (node.task_marker) {
    newNode.task_status = node.task_status ?? "todo"
    newNode.task_marker = node.task_marker ?? "[ ]"
  }

  const newId = tree.addNode(parentId, newNode)

  // Update original node with text before cursor
  tree.updateNode(nodeId, { content: setNodeText(node, beforeText) })

  // Move children of the original node to the new node
  const children = tree.getChildren(nodeId)
  for (const child of children) {
    tree.moveNode(child.id, newId, child.parent_idx ?? 0)
  }

  return { beforeId: nodeId, afterId: newId }
}

// =============================================================================
// Merge With Previous
// =============================================================================

/**
 * Merge a node with its previous sibling (Backspace at start of title).
 *
 * Merge rules (from the Backspace rules table):
 * - Empty node, has prev: delete this, cursor to prev
 * - Content, prev is childless: prepend prev's content to this, delete prev
 * - Content, prev has children: move this as last child of prev
 * - No prev, has parent: outdent (become sibling of parent)
 *
 * @param tree - Tree mutator (Repo satisfies this)
 * @param nodeId - ID of the node to merge backward
 * @returns MergeResult with survivor ID and cursor offset, or null if no merge possible
 */
export function mergeWithPrevious(tree: TreeMutator, nodeId: string): MergeResult | null {
  const node = tree.getNode(nodeId)
  if (!node) return null

  const parentId = node.parent_id
  if (!parentId) return null

  const siblings = tree.getChildren(parentId)
  const currentIndex = siblings.findIndex((s) => s.id === nodeId)

  const text = getNodeText(node)
  const isEmpty = text.length === 0
  const children = tree.getChildren(nodeId)

  if (currentIndex > 0) {
    // Has previous sibling
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- currentIndex > 0 guarantees prev exists
    const prev = siblings[currentIndex - 1]!
    const prevText = getNodeText(prev)
    const prevChildren = tree.getChildren(prev.id)

    if (isEmpty && children.length === 0) {
      // Empty node with no children: just delete it, cursor goes to prev
      tree.deleteNode(nodeId)
      return { survivorId: prev.id, cursorOffset: prevText.length }
    }

    if (prevChildren.length === 0) {
      // Prev has no children: merge prev content into this node
      const mergedText = prevText + text
      tree.updateNode(nodeId, { content: setNodeText(node, mergedText) })

      // Move any children of prev to before our children
      // (prev is childless in this branch, so nothing to move)

      tree.deleteNode(prev.id)
      return { survivorId: nodeId, cursorOffset: prevText.length }
    }

    // Prev has children: move this node as last child of prev
    const lastChildIdx =
      prevChildren.length > 0
        ? // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- prevChildren.length > 0 guarantees last element exists
          (prevChildren[prevChildren.length - 1]!.parent_idx ?? 0) + 1
        : 0
    tree.moveNode(nodeId, prev.id, lastChildIdx)
    return { survivorId: nodeId, cursorOffset: 0 }
  }

  // No previous sibling: outdent (become sibling after parent)
  const parent = tree.getNode(parentId)
  if (!parent?.parent_id) return null

  const parentSiblings = tree.getChildren(parent.parent_id)
  const parentIndex = parentSiblings.findIndex((s) => s.id === parentId)
  const parentIdx = parent.parent_idx ?? 0
  const nextParentSibling = parentSiblings[parentIndex + 1]
  const nextParentIdx = nextParentSibling?.parent_idx ?? parentIdx + 1
  const newSortOrder = (parentIdx + nextParentIdx) / 2

  tree.moveNode(nodeId, parent.parent_id, newSortOrder)
  return { survivorId: nodeId, cursorOffset: 0 }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the display/edit text of a node.
 * For outline items (oi), this is the name (heading text).
 * For list items with task markers, strips the checkbox prefix.
 * For other types, this is the content.
 */
export function getNodeText(node: KNode): string {
  // Outline items use name as their heading text
  if (node.type === "oi") return node.name ?? node.content ?? ""
  // Tasks (list items with task_marker): content includes the checkbox prefix "- [x] ..."
  // Strip exactly the prefix "- [.] " (dash, space, bracket, mark, bracket, space)
  if (node.task_marker && node.content) {
    return node.content.replace(/^- \[.\] /, "")
  }
  return node.content ?? ""
}

/**
 * Set the display/edit text of a node, preserving the content format.
 * Returns the new content string (does NOT mutate).
 */
export function setNodeText(node: KNode, text: string): string {
  if (node.type === "oi") return text
  if (node.task_marker) {
    // Extract inner character from marker: "[x]" → "x"
    const inner = node.task_marker.length === 3 ? node.task_marker[1] : " "
    return `- [${inner}] ${text}`
  }
  return text
}

/**
 * Get the previous visible sibling of a node.
 * Returns null if the node is the first child.
 */
export function getPreviousSibling(tree: TreeMutator, nodeId: string): KNode | null {
  const node = tree.getNode(nodeId)
  if (!node?.parent_id) return null

  const siblings = tree.getChildren(node.parent_id)
  const index = siblings.findIndex((s) => s.id === nodeId)
  return index > 0 ? (siblings[index - 1] ?? null) : null
}

/**
 * Get the next visible sibling of a node.
 * Returns null if the node is the last child.
 */
export function getNextSibling(tree: TreeMutator, nodeId: string): KNode | null {
  const node = tree.getNode(nodeId)
  if (!node?.parent_id) return null

  const siblings = tree.getChildren(node.parent_id)
  const index = siblings.findIndex((s) => s.id === nodeId)
  return index < siblings.length - 1 ? (siblings[index + 1] ?? null) : null
}
