/**
 * Tree Traversal — configurable DFS walk and spatial queries.
 *
 * TreeWalk.nodes: SlateJS-style pluggable traversal with orthogonal match + into predicates.
 */

import { KNode } from "@km/core"
import type { TreeMutator } from "./block-ops.ts"

// =============================================================================
// Tree.nodes — SlateJS-style pluggable traversal
// =============================================================================

/** Yielded by Tree.nodes for each visited node. */
export type NodeEntry = [node: KNode, depth: number]

/** Match predicate: a function, or an object shorthand for `KNode.matches(node, props)`. */
export type NodeMatch = ((node: KNode) => boolean) | Partial<Record<string, unknown>>

export interface NodesOptions {
  /** Which nodes to YIELD. Function or object shorthand (shallow property equality via KNode.matches).
   *  Always walks children regardless of match result. */
  match?: NodeMatch
  /** Whether to descend INTO this node's children. Default: always true. */
  into?: (node: KNode) => boolean
  /** DFS in reverse order (bottom-up, last child first). */
  reverse?: boolean
  /** Start from specific node ID (skip all nodes before it in DFS order). */
  at?: string
  /** Match mode: "all" = yield every match, "highest" = first match per branch,
   *  "lowest" = deepest match per branch. Default: "all". */
  mode?: "all" | "highest" | "lowest"
}

/** Tree namespace — pluggable tree traversal (SlateJS pattern). */
export const TreeWalk = {
  /**
   * Iterate nodes in DFS order with orthogonal match + into predicates.
   *
   * - `match` controls which nodes are yielded (default: all)
   * - `into` controls whether children are visited (default: always true)
   * - These are orthogonal: match never affects descent, into never affects yielding
   * - `reverse` flips DFS to process last children first (bottom-up)
   * - `at` skips all nodes before the given ID in DFS order
   * - `mode` controls match behavior per branch:
   *   - "all" (default): yield every matching node
   *   - "highest": yield only the first (shallowest) match per branch, skip deeper matches
   *   - "lowest": yield only the deepest match per branch (leaf-most match in each path)
   *
   * Predicates fall into three layers (see docs/design/data-model.md):
   *   - Tree (match): KNode.isOutline, isItem, isBlock, isTask, isEmbed — data model type
   *   - View (into): isCollapsedChild, isHidden, foldDepths — whether to descend
   *   - Render (neither): maxContentLines, task status filter — display-only
   *
   * @example All outline items
   * ```ts
   * TreeWalk.nodes(tree, rootId, { match: KNode.isOutline })
   * ```
   *
   * @example Visible navigable nodes (skip collapsed subtrees)
   * ```ts
   * TreeWalk.nodes(tree, rootId, { match: isNavigable, into: n => !isCollapsed(n) })
   * ```
   *
   * @example Last node in subtree (for ctrl-p)
   * ```ts
   * const [last] = [...TreeWalk.nodes(tree, rootId, { reverse: true })].slice(0, 1)
   * ```
   *
   * @example Shallowest tasks only (skip nested tasks)
   * ```ts
   * TreeWalk.nodes(tree, rootId, { match: KNode.isTask, mode: "highest" })
   * ```
   */
  *nodes(tree: TreeMutator, rootId: string, opts?: NodesOptions): Generator<NodeEntry> {
    const root = tree.getNode(rootId)
    if (!root) return

    const { match: rawMatch, into, reverse, at, mode = "all" } = opts ?? {}

    // Normalize match: object shorthand → KNode.matches predicate
    const match =
      typeof rawMatch === "function" ? rawMatch : rawMatch ? (n: KNode) => KNode.matches(n, rawMatch) : undefined

    // For "lowest" mode we need to buffer: a match is only yielded if no
    // descendant also matches. We track pending matches on the stack.

    if (mode === "lowest") {
      yield* lowestNodes(tree, root, { match, into, reverse, at })
      return
    }

    // Iterative DFS with explicit stack (avoids call-stack overflow on deep trees)
    // Stack entries: [node, depth, highestMatched]
    // highestMatched: in "highest" mode, true means an ancestor already matched
    const stack: Array<[KNode, number, boolean]> = [[root, 0, false]]

    let skipping = at != null

    while (stack.length > 0) {
      // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length check above
      const [node, depth, ancestorMatched] = stack.pop()!

      // Handle `at` — skip until we find the target node
      if (skipping) {
        if (node.id === at) skipping = false
        // Still push children so we can find `at` in subtrees
        const children = tree.getChildren(node.id)
        if (into && !into(node)) continue
        if (reverse) {
          for (let i = 0; i < children.length; i++) {
            // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
            stack.push([children[i]!, depth + 1, false])
          }
        } else {
          for (let i = children.length - 1; i >= 0; i--) {
            // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
            stack.push([children[i]!, depth + 1, false])
          }
        }
        continue
      }

      // Check match
      const isMatch = !match || match(node)
      let thisMatched = ancestorMatched

      if (isMatch) {
        if (mode === "highest" && ancestorMatched) {
          // An ancestor already matched in this branch — skip this match
        } else {
          yield [node, depth]
          if (mode === "highest") thisMatched = true
        }
      }

      // Check into — controls descent
      if (into && !into(node)) continue

      // Push children
      const children = tree.getChildren(node.id)
      if (reverse) {
        // Push in forward order so DFS pops in reverse (last child first)
        for (let i = 0; i < children.length; i++) {
          // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
          stack.push([children[i]!, depth + 1, thisMatched])
        }
      } else {
        // Push in reverse order so leftmost child is processed first
        for (let i = children.length - 1; i >= 0; i--) {
          // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
          stack.push([children[i]!, depth + 1, thisMatched])
        }
      }
    }
  },
}

/**
 * "lowest" mode: yield only the deepest match in each branch.
 * Uses iterative DFS with a pending-match stack.
 */
function* lowestNodes(
  tree: TreeMutator,
  root: KNode,
  opts: { match?: (node: KNode) => boolean; into?: (node: KNode) => boolean; reverse?: boolean; at?: string },
): Generator<NodeEntry> {
  const { match, into, reverse, at } = opts

  // We do a two-pass approach: collect all entries first, then walk bottom-up.
  // For each node, we yield it only if it matches and no descendant matches.
  //
  // Iterative approach: DFS post-order. Track if any child matched.
  // Stack entry: [node, depth, phase] where phase 0 = pre (push children), phase 1 = post (check yield)
  const stack: Array<[KNode, number, number]> = [[root, 0, 0]]
  // Track whether subtree had a match (by node id)
  const subtreeHasMatch = new Map<string, boolean>()

  let skipping = at != null

  while (stack.length > 0) {
    // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- length check above
    const top = stack.pop()!
    const [node, depth, phase] = top

    if (phase === 0) {
      // Handle `at` skipping
      if (skipping) {
        if (node.id === at) skipping = false
        // Still push children to find `at`
        const children = tree.getChildren(node.id)
        if (!into || into(node)) {
          if (reverse) {
            for (let i = 0; i < children.length; i++) {
              // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
              stack.push([children[i]!, depth + 1, 0])
            }
          } else {
            for (let i = children.length - 1; i >= 0; i--) {
              // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
              stack.push([children[i]!, depth + 1, 0])
            }
          }
        }
        continue
      }

      // Pre-order: push self for post-processing, then push children
      stack.push([node, depth, 1])

      if (!into || into(node)) {
        const children = tree.getChildren(node.id)
        // Push in reverse for forward DFS (or forward for reverse DFS)
        if (reverse) {
          for (let i = 0; i < children.length; i++) {
            // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
            stack.push([children[i]!, depth + 1, 0])
          }
        } else {
          for (let i = children.length - 1; i >= 0; i--) {
            // oxlint-disable-next-line typescript-eslint(no-non-null-assertion) -- loop bounds
            stack.push([children[i]!, depth + 1, 0])
          }
        }
      }
    } else {
      // Post-order: check if this node should yield
      const isMatch = !match || match(node)
      const childMatched = subtreeHasMatch.get(node.id) ?? false

      if (isMatch && !childMatched) {
        yield [node, depth]
      }

      // Propagate match info to parent
      if (isMatch || childMatched) {
        const parentId = node.parent_id
        if (parentId) {
          subtreeHasMatch.set(parentId, true)
        }
      }
    }
  }
}

