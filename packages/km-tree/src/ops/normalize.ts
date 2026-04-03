/**
 * Tree Normalization — schema enforcement after every mutation.
 *
 * SlateJS-inspired: normalizers run after each mutation (addNode, updateNode,
 * moveNode, deleteNode) to enforce structural constraints. Invalid states are
 * automatically corrected, not just detected.
 *
 * Default normalizers enforce rules from schema.ts:
 * - Blocks (non-items) cannot have children → children moved to grandparent
 * - Items must be type "h" (outline heading) → type corrected
 * - canParent: only items can be parents → child moved to nearest valid ancestor
 *
 * Custom normalizers can be added via the plugin chain.
 *
 * withoutNormalizing() batches operations — normalization deferred until the
 * outermost batch completes, then all dirty nodes are normalized.
 */

import type { TreeMutator } from "./block-ops.ts"
import { canHaveChildren } from "../schema.ts"

// =============================================================================
// Types
// =============================================================================

/** A normalizer function that can fix a node. Call next() to run remaining normalizers. */
export type Normalizer = (nodeId: string, tree: TreeMutator, next: () => void) => void

// =============================================================================
// Default Normalizers
// =============================================================================

/**
 * Blocks cannot have children — move children up to the block's parent.
 * If the block has no parent (root-level), children become root nodes.
 */
function normalizeBlockChildren(nodeId: string, tree: TreeMutator, next: () => void): void {
  const node = tree.getNode(nodeId)
  if (!node) {
    next()
    return
  }

  if (!canHaveChildren(node)) {
    const children = tree.getChildren(nodeId)
    if (children.length > 0) {
      // Move children to the block's parent
      const targetParent = node.parent_id ?? null
      for (const child of children) {
        tree.moveNode(child.id, targetParent!, children.indexOf(child))
      }
    }
  }

  next()
}

/**
 * Items must have type "h" (outline heading).
 * If an item has a different type, correct it to "h".
 */
function normalizeItemType(nodeId: string, tree: TreeMutator, next: () => void): void {
  const node = tree.getNode(nodeId)
  if (!node) {
    next()
    return
  }

  if (node.item != null && node.type !== "h") {
    tree.updateNode(nodeId, { type: "h" })
  }

  next()
}

/** Default normalizer chain. */
export const defaultNormalizers: readonly Normalizer[] = [normalizeBlockChildren, normalizeItemType]

// =============================================================================
// Normalizer Engine
// =============================================================================

export interface NormalizerEngine {
  /** Normalize a single node through the normalizer chain. */
  normalize(tree: TreeMutator, nodeId: string): void
  /** Normalize all root-reachable nodes. */
  normalizeAll(tree: TreeMutator): void
}

/** Create a normalizer engine with the given chain (defaults to schema rules). */
export function createNormalizer(customNormalizers?: Normalizer[]): NormalizerEngine {
  const chain = customNormalizers ?? [...defaultNormalizers]

  function normalize(tree: TreeMutator, nodeId: string): void {
    let index = 0
    const runNext = () => {
      if (index < chain.length) {
        const current = chain[index++]!
        current(nodeId, tree, runNext)
      }
    }
    runNext()
  }

  function normalizeAll(tree: TreeMutator): void {
    const visit = (parentId: string | null) => {
      const children = tree.getChildren(parentId)
      for (const child of children) {
        normalize(tree, child.id)
        visit(child.id)
      }
    }
    visit(null)
  }

  return { normalize, normalizeAll }
}

// =============================================================================
// withNormalization — decorator that auto-normalizes after mutations
// =============================================================================

export interface NormalizedTreeMutator extends TreeMutator {
  /** Run a batch of operations without per-op normalization. Normalizes all dirty nodes at the end. */
  withoutNormalizing<R>(fn: () => R): R
}

/**
 * Wrap a TreeMutator to auto-normalize after every mutation.
 * Like SlateJS's normalizeNode() — prevents forgetting to normalize.
 */
export function withNormalization(tree: TreeMutator, customNormalizers?: Normalizer[]): NormalizedTreeMutator {
  const engine = createNormalizer(customNormalizers)
  let batching = 0
  const dirtyNodes = new Set<string>()

  // Track which mutations came from normalization to prevent infinite loops
  let normalizing = false

  function runNormalize(nodeId: string): void {
    if (normalizing) return // prevent re-entry during normalization
    dirtyNodes.add(nodeId)
    if (batching > 0) return // deferred

    flushDirty()
  }

  function flushDirty(): void {
    normalizing = true
    try {
      // Iterate until stable — normalizers may dirty new nodes
      let passes = 0
      const maxPasses = 10
      while (dirtyNodes.size > 0 && passes < maxPasses) {
        const batch = [...dirtyNodes]
        dirtyNodes.clear()
        for (const id of batch) {
          if (tree.getNode(id)) {
            engine.normalize(tree, id)
          }
        }
        passes++
      }
    } finally {
      normalizing = false
      dirtyNodes.clear()
    }
  }

  const result: NormalizedTreeMutator = {
    getNode: (id) => tree.getNode(id),
    getChildren: (parentId) => tree.getChildren(parentId),

    addNode(parentId, node) {
      const id = tree.addNode(parentId, node)
      runNormalize(id)
      if (parentId) runNormalize(parentId)
      return id
    },

    updateNode(id, changes) {
      tree.updateNode(id, changes)
      if (!normalizing) runNormalize(id)
    },

    moveNode(id, newParentId, position) {
      const node = tree.getNode(id)
      const oldParentId = node?.parent_id
      tree.moveNode(id, newParentId, position)
      runNormalize(id)
      runNormalize(newParentId)
      if (oldParentId) runNormalize(oldParentId)
    },

    deleteNode(id) {
      const node = tree.getNode(id)
      const parentId = node?.parent_id
      tree.deleteNode(id)
      if (parentId) runNormalize(parentId)
    },

    withoutNormalizing<R>(fn: () => R): R {
      batching++
      try {
        return fn()
      } finally {
        if (--batching === 0) {
          flushDirty()
        }
      }
    },
  }

  return result
}
