/**
 * sparse — inverted ancestor-count index for descendants(key).some()/.count().
 *
 * Assumes the observed signal is **sparse**: few nodes hold a truthy value at
 * once (cursor, editing, single-select). Under that assumption:
 *
 *   - writes are O(depth): flipping one node's signal walks up its ancestors
 *     once and ±1s a Map<ancestorId, count>
 *   - reads are O(1): lookup the ancestor count and return either `count > 0`
 *     (some) or `count` (count)
 *
 * For dense signals (e.g., "isDone" on thousands of tasks), the write cost
 * stays O(depth) per flip but the amortized cost becomes dominated by the
 * number of flips per frame — consider `walk()` or a dense strategy instead.
 *
 * State lives entirely in this factory's closure. Multiple descriptors over
 * the same key each get their own index (no sharing), which trades a little
 * memory for architectural simplicity.
 */

import { signal, startBatch, endBatch } from "alien-signals"
import type { Strategy, StrategyContext, StrategyInstance } from "../strategy.ts"

export const sparse: Strategy = (ctx: StrategyContext): StrategyInstance => {
  const { descriptor } = ctx
  if (descriptor.dir !== "down") {
    throw new Error(`sparse strategy requires dir='down' (descendants), got '${descriptor.dir}'`)
  }
  if (descriptor.type === "reduce") {
    throw new Error(`sparse strategy doesn't support .reduce() — use walk() instead`)
  }

  const truthyNodes = new Set<string>()
  const countByAncestor = new Map<string, number>()
  const version = signal(0)
  let epoch = 0

  function increment(nodeId: string): void {
    for (const anc of ctx.walkUp(nodeId)) {
      countByAncestor.set(anc, (countByAncestor.get(anc) ?? 0) + 1)
    }
  }
  function decrement(nodeId: string): void {
    for (const anc of ctx.walkUp(nodeId)) {
      const n = (countByAncestor.get(anc) ?? 0) - 1
      if (n <= 0) countByAncestor.delete(anc)
      else countByAncestor.set(anc, n)
    }
  }

  return {
    onSignalChange(nodeId, oldValue, newValue) {
      const wasTruthy = !!oldValue
      const isTruthy = !!newValue
      if (wasTruthy === isTruthy) return
      startBatch()
      try {
        if (isTruthy) {
          if (truthyNodes.has(nodeId)) return
          truthyNodes.add(nodeId)
          increment(nodeId)
        } else {
          if (!truthyNodes.has(nodeId)) return
          truthyNodes.delete(nodeId)
          decrement(nodeId)
        }
        version(++epoch)
      } finally {
        endBatch()
      }
    },

    onRebind() {
      countByAncestor.clear()
      for (const nid of truthyNodes) increment(nid)
      version(++epoch)
    },

    onClear() {
      truthyNodes.clear()
      countByAncestor.clear()
      version(++epoch)
    },

    read(nodeId) {
      if (descriptor.type === "some") {
        return () => {
          ctx.treeVersion() // rebind invalidation
          version() // index-mutation invalidation
          if (descriptor.includeSelf) {
            const selfSig = ctx.get(nodeId)[descriptor.key] as (() => unknown) | undefined
            if (selfSig?.()) return true
          }
          return (countByAncestor.get(nodeId) ?? 0) > 0
        }
      }
      // count
      return () => {
        ctx.treeVersion()
        version()
        let n = countByAncestor.get(nodeId) ?? 0
        if (descriptor.includeSelf) {
          const selfSig = ctx.get(nodeId)[descriptor.key] as (() => unknown) | undefined
          if (selfSig?.()) n++
        }
        return n
      }
    },
  }
}
