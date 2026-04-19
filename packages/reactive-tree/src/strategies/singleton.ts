/**
 * singleton — specialized sparse index for signals with EXACTLY ONE truthy
 * node at a time (or zero).
 *
 * Common example: the cursor — there's always exactly one cursor node (or
 * none). For that domain, the sparse index's per-ancestor count map is
 * overkill — a single `currentNode` pointer + a cached ancestor set is enough.
 *
 * Reads: O(1) via set-membership lookup against the ancestor set.
 * Writes: O(depth_new + depth_old) — rebuild the ancestor set on change.
 *
 * Usage:
 *
 *   tree.descendants(s => s.cursor).some({ strategy: singleton })
 *
 * Enforces single-truthy invariant at runtime: setting a second node truthy
 * while another is already truthy throws. If you need "0-1 truthy" without
 * enforcement, use `sparse` (its write cost is ~identical at depth ≈ 10).
 */

import { signal, startBatch, endBatch } from "alien-signals"
import type { Strategy, StrategyContext, StrategyInstance } from "../strategy.ts"

export const singleton: Strategy = (ctx: StrategyContext): StrategyInstance => {
  const { descriptor } = ctx
  if (descriptor.dir !== "down") {
    throw new Error(`singleton strategy requires dir='down' (descendants), got '${descriptor.dir}'`)
  }
  if (descriptor.type === "reduce") {
    throw new Error(`singleton strategy doesn't support .reduce()`)
  }

  /** The one node currently truthy, or null. */
  let truthyNode: string | null = null
  /** Ancestors of `truthyNode`, precomputed on change. */
  let ancestors = new Set<string>()
  const version = signal(0)
  let epoch = 0

  function rebuildAncestors(): void {
    ancestors = new Set()
    if (truthyNode === null) return
    for (const anc of ctx.walkUp(truthyNode)) ancestors.add(anc)
  }

  return {
    onSignalChange(nodeId, oldValue, newValue) {
      const wasTruthy = !!oldValue
      const isTruthy = !!newValue
      if (wasTruthy === isTruthy) return
      startBatch()
      try {
        if (isTruthy) {
          if (truthyNode !== null && truthyNode !== nodeId) {
            throw new Error(
              `singleton strategy violated: node '${nodeId}' set truthy while '${truthyNode}' is still truthy. ` +
                `Clear the previous node first, or use \`sparse\` if multiple truthy nodes are allowed.`,
            )
          }
          truthyNode = nodeId
          rebuildAncestors()
        } else {
          if (truthyNode === nodeId) {
            truthyNode = null
            ancestors.clear()
          }
        }
        version(++epoch)
      } finally {
        endBatch()
      }
    },

    onRebind() {
      rebuildAncestors()
      version(++epoch)
    },

    onClear() {
      truthyNode = null
      ancestors.clear()
      version(++epoch)
    },

    read(nodeId) {
      if (descriptor.type === "some") {
        return () => {
          ctx.treeVersion()
          version()
          if (descriptor.includeSelf && truthyNode === nodeId) return true
          return ancestors.has(nodeId)
        }
      }
      // count — always 0 or 1 for singleton
      return () => {
        ctx.treeVersion()
        version()
        let n = ancestors.has(nodeId) ? 1 : 0
        if (descriptor.includeSelf && truthyNode === nodeId) n++
        return n
      }
    },
  }
}
