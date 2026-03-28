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

import { KNode, type TaskMarker, type TaskStatus } from "@km/core"

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

  // Inherit item trait
  if (node.item) {
    newNode.item = true
  }

  // Inherit list marker
  if (node.list_marker) {
    newNode.list_marker = node.list_marker
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
// Merge With Next
// =============================================================================

/**
 * Merge a node with its next sibling (Delete at end of title).
 *
 * Mirror of mergeWithPrevious. The current node survives (keeps its type/traits).
 * Next sibling's text is appended and next is deleted.
 *
 * Merge rules:
 * - Next is empty, no children: delete next, cursor stays
 * - Next has content, no children: append next's text to this, delete next
 * - Next has content and children: append next's text, reparent next's children under this
 * - No next sibling: return null (boundary)
 *
 * @param tree - Tree mutator (Repo satisfies this)
 * @param nodeId - ID of the node to merge forward from
 * @returns MergeResult with survivor ID and cursor offset, or null if no merge possible
 */
export function mergeWithNext(tree: TreeMutator, nodeId: string): MergeResult | null {
  const node = tree.getNode(nodeId)
  if (!node) return null

  const parentId = node.parent_id
  if (!parentId) return null

  const siblings = tree.getChildren(parentId)
  const currentIndex = siblings.findIndex((s) => s.id === nodeId)

  if (currentIndex < 0 || currentIndex >= siblings.length - 1) {
    // No next sibling
    return null
  }

  const text = getNodeText(node)

  // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- bounds check above guarantees next exists
  const next = siblings[currentIndex + 1]!
  const nextText = getNodeText(next)
  const nextChildren = tree.getChildren(next.id)

  if (nextText.length === 0 && nextChildren.length === 0) {
    // Next is empty with no children: just delete it
    tree.deleteNode(next.id)
    return { survivorId: nodeId, cursorOffset: text.length }
  }

  // Append next's text to current node
  const mergedText = text + nextText
  tree.updateNode(nodeId, { content: setNodeText(node, mergedText) })

  // Reparent next's children under current node
  if (nextChildren.length > 0) {
    const currentChildren = tree.getChildren(nodeId)
    const lastChildIdx =
      currentChildren.length > 0
        ? // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length > 0 guarantees last element
          (currentChildren[currentChildren.length - 1]!.parent_idx ?? 0) + 1
        : 0
    for (let i = 0; i < nextChildren.length; i++) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds guarantee element exists
      tree.moveNode(nextChildren[i]!.id, nodeId, lastChildIdx + i)
    }
  }

  // Delete the next node (now empty)
  tree.deleteNode(next.id)

  return { survivorId: nodeId, cursorOffset: text.length }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the display/edit text of a node.
 * For outline items (type:"h", item:true), this is the name (heading text).
 * For list items with task markers, strips the checkbox prefix.
 * For other types, this is the content.
 */
export function getNodeText(node: KNode): string {
  // Outline items use name as their heading text
  if (KNode.isOutline(node)) return node.name ?? node.content ?? ""
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
  if (KNode.isOutline(node)) return text
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

// =============================================================================
// Prefix Conversion (Markdown shortcuts)
// =============================================================================

/**
 * Result of detecting a markdown prefix in edited content.
 * Used by the TUI to convert node types when the user types a recognized prefix.
 */
export interface PrefixConversion {
  /** Number of characters to strip from the edit field */
  prefixLength: number
  /** Node property changes to apply */
  nodeChanges: Partial<KNode>
}

/**
 * Detect markdown prefix at the start of edited content.
 *
 * The ENTIRE content must be the prefix (typed from scratch on an empty node).
 * Triggered after the user types a space following a markdown prefix.
 *
 * Supported prefixes:
 * - `- `, `* `, `+ ` → list item (type:"p", item:true)
 * - `1. ` → list item (type:"p", item:true)
 * - `# `, `## `, `### ` etc. → outline item (type:"h", item:true)
 * - `[] `, `[ ] ` → task trait (todo)
 * - `[x] `, `[X] ` → task trait (done)
 * - `[/] ` → task trait (wip)
 * - `[!] ` → task trait (blocked)
 * - `[-] ` → task trait (dropped)
 * - `> ` → quote
 */
export function detectPrefixConversion(content: string): PrefixConversion | null {
  // Bullet list: "- ", "* ", "+ "
  if (content === "- " || content === "* " || content === "+ ") {
    return {
      prefixLength: 2,
      nodeChanges: { type: "p", item: true, list_marker: content[0] },
    }
  }

  // Numbered list: "1. " (any digit sequence)
  if (/^\d+\. $/.test(content)) {
    return {
      prefixLength: content.length,
      nodeChanges: { type: "p", item: true, list_marker: content.slice(0, -1) },
    }
  }

  // Heading: "# ", "## ", "### " etc. (up to 6)
  const headingMatch = content.match(/^(#{1,6}) $/)
  if (headingMatch?.[1]) {
    return {
      prefixLength: content.length,
      nodeChanges: {
        type: "h",
        item: true,
        fstype: "mdsection",
      },
    }
  }

  // Task markers: "[] ", "[ ] ", "[x] ", "[X] ", "[/] ", "[!] ", "[-] "
  const taskMatch = content.match(/^\[([xX /!-]?)\] $/)
  if (taskMatch) {
    const inner = taskMatch[1] === "" || taskMatch[1] === undefined ? " " : taskMatch[1]
    const markerMap: Record<string, { marker: TaskMarker; status: TaskStatus }> = {
      " ": { marker: "[ ]", status: "todo" },
      x: { marker: "[x]", status: "done" },
      X: { marker: "[x]", status: "done" },
      "/": { marker: "[/]", status: "wip" },
      "!": { marker: "[!]", status: "blocked" },
      "-": { marker: "[-]", status: "dropped" },
    }
    const mapped = markerMap[inner]
    if (mapped) {
      return {
        prefixLength: content.length,
        nodeChanges: {
          task_marker: mapped.marker,
          task_status: mapped.status,
          list_marker: "-",
        },
      }
    }
  }

  // Block quote: "> "
  if (content === "> ") {
    return {
      prefixLength: 2,
      nodeChanges: { type: "quote" },
    }
  }

  return null
}

// =============================================================================
// Backspace Degradation
// =============================================================================

/**
 * Determine what backspace at position 0 should do before merging with previous.
 *
 * Strips features in priority order:
 * 1. Task trait (remove task_marker/task_status) → keep type
 * 2. Non-paragraph type → convert to p
 * 3. null → caller should merge with previous
 *
 * Returns node changes to apply, or null if no degradation possible (should merge).
 */
export function backspaceDegradation(node: KNode): Partial<KNode> | null {
  // Step 1: Strip task trait
  if (node.task_marker) {
    return {
      task_marker: undefined,
      task_status: undefined,
    }
  }

  // Step 2: Strip item trait (p+item → p, h+item → p)
  if (node.item) {
    return {
      type: "p",
      item: undefined,
      list_marker: undefined,
      fstype: undefined,
    }
  }

  // Step 3: Convert non-paragraph type to p
  if (node.type !== "p") {
    return {
      type: "p",
      // Clear type-specific fields
      list_marker: undefined,
      fstype: undefined,
    }
  }

  // Already a plain p with no traits → caller should merge with previous
  return null
}
