/**
 * walk — reference implementation: traverse on every read.
 *
 * The correctness baseline. No assumptions about signal density — works for
 * any aggregate: some/count/reduce × up/down. Writes are O(1); reads are
 * O(subtree) for `descendants(...)` and O(depth) for `ancestors(...)`.
 *
 * Use when:
 *
 *   - the observed signal is dense (many truthy nodes) and `sparse()` would
 *     pay too many per-write updates
 *   - you're using `.reduce()` (needs actual values, not just membership)
 *   - you're on the ancestors direction (walk is already O(depth), so no
 *     index is worth maintaining)
 *
 * No internal state — every read walks fresh. The alien-signals `computed()`
 * wrapper still memoizes across identical dependency snapshots, so repeated
 * reads without signal changes remain cheap.
 */

import type { Strategy, StrategyContext, StrategyInstance } from "../strategy.ts"

export const walk: Strategy = (ctx: StrategyContext): StrategyInstance => {
  const { descriptor } = ctx

  return {
    read(nodeId) {
      if (descriptor.type === "some") {
        return () => {
          ctx.treeVersion()
          if (descriptor.includeSelf) {
            const selfSig = ctx.get(nodeId)[descriptor.key] as (() => unknown) | undefined
            if (selfSig?.()) return true
          }
          const iter = descriptor.dir === "down" ? ctx.walkDown(nodeId) : ctx.walkUp(nodeId)
          for (const vid of iter) {
            const sig = ctx.get(vid)[descriptor.key] as (() => unknown) | undefined
            if (sig?.()) return true
          }
          return false
        }
      }
      if (descriptor.type === "count") {
        return () => {
          ctx.treeVersion()
          let n = 0
          if (descriptor.includeSelf) {
            const selfSig = ctx.get(nodeId)[descriptor.key] as (() => unknown) | undefined
            if (selfSig?.()) n++
          }
          const iter = descriptor.dir === "down" ? ctx.walkDown(nodeId) : ctx.walkUp(nodeId)
          for (const vid of iter) {
            const sig = ctx.get(vid)[descriptor.key] as (() => unknown) | undefined
            if (sig?.()) n++
          }
          return n
        }
      }
      // reduce
      return () => {
        ctx.treeVersion()
        const reducer = descriptor.reducer
        if (!reducer) throw new Error(`reduce descriptor missing reducer: key='${descriptor.key}'`)
        let acc: unknown =
          typeof descriptor.initial === "function" ? (descriptor.initial as () => unknown)() : descriptor.initial

        if (descriptor.dir === "up") {
          // Root-to-self order for ancestors.
          const ancestors: string[] = []
          if (descriptor.includeSelf) ancestors.push(nodeId)
          for (const vid of ctx.walkUp(nodeId)) ancestors.push(vid)
          ancestors.reverse()
          for (const vid of ancestors) {
            const sig = ctx.get(vid)[descriptor.key] as (() => unknown) | undefined
            if (sig) acc = reducer(acc, sig())
          }
        } else {
          if (descriptor.includeSelf) {
            const sig = ctx.get(nodeId)[descriptor.key] as (() => unknown) | undefined
            if (sig) acc = reducer(acc, sig())
          }
          for (const vid of ctx.walkDown(nodeId)) {
            const sig = ctx.get(vid)[descriptor.key] as (() => unknown) | undefined
            if (sig) acc = reducer(acc, sig())
          }
        }
        return acc
      }
    },
  }
}

/**
 * Alias for `walk` bound specifically to the ancestors direction. Semantically
 * identical — walk handles both directions via `descriptor.dir`. Kept as a
 * named export so default-resolution code and user-facing DSL can document
 * intent ("I explicitly want a walk-up-on-read strategy here").
 */
export const walkUp: Strategy = (ctx: StrategyContext): StrategyInstance => {
  if (ctx.descriptor.dir !== "up") {
    throw new Error(`walkUp strategy requires dir='up' (ancestors), got '${ctx.descriptor.dir}'`)
  }
  return walk(ctx)
}
