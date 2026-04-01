/**
 * Tree Validation — invariant checking after mutations.
 *
 * withValidation: wires validate() to fire after each mutation (only when KM_STRICT is set).
 * withTreeValidation: structural invariant checks (orphans, invalid sort order, etc.).
 * withBatch: defers validation until the outermost batch completes.
 */

import type { TreeMutator } from "./block-ops.ts"

// =============================================================================
// withValidation — wire validate() to mutation methods
// =============================================================================

/** Validate-on-write plugin. Wraps each mutation to call validate() after. Zero overhead in prod. */
export function withValidation<T extends TreeMutator & { validate?: () => void }>(tree: T): T {
  if (!process.env.KM_STRICT) return tree // zero overhead in prod

  let batching = 0

  // Ensure validate exists (base no-op)
  tree.validate ??= () => {}

  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn.apply(tree, args)
      if (!batching) tree.validate!()
      return result
    }

  tree.addNode = wrap(tree.addNode)
  tree.updateNode = wrap(tree.updateNode)
  tree.moveNode = wrap(tree.moveNode)
  tree.deleteNode = wrap(tree.deleteNode)

  // withBatch defers validate until outermost batch completes
  ;(tree as TreeMutator & { withBatch: <R>(fn: () => R) => R }).withBatch = <R>(fn: () => R): R => {
    batching++
    try {
      return fn()
    } finally {
      if (!--batching) tree.validate!()
    }
  }

  return tree
}

// =============================================================================
// withTreeValidation — structural invariant checks
// =============================================================================

/** Structural invariant checks: orphans, invalid sort order, blocks with children. */
export function withTreeValidation<T extends TreeMutator & { validate?: () => void }>(tree: T): T {
  const prev = tree.validate ?? (() => {})

  tree.validate = () => {
    prev()

    // Walk all nodes reachable from root
    const visit = (parentId: string | null) => {
      const children = tree.getChildren(parentId)
      for (const child of children) {
        // Re-fetch via getNode for authoritative data (children cache may be stale)
        const node = tree.getNode(child.id)
        if (!node) continue

        // Block (non-item) nodes must not have children
        if (!node.item && tree.getChildren(node.id).length > 0) {
          throw new Error(`INVARIANT block-has-children: ${node.id}`)
        }

        // Parent must exist (unless root)
        if (node.parent_id && node.parent_id !== "." && !tree.getNode(node.parent_id)) {
          throw new Error(`INVARIANT orphan-node: ${node.id}`)
        }

        // Sort order must be finite
        if (!Number.isFinite(node.parent_idx)) {
          throw new Error(`INVARIANT invalid-sort-order: ${node.id}`)
        }

        // Recurse into children
        visit(node.id)
      }
    }

    visit(null)
  }

  return tree
}
