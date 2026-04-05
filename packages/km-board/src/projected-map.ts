/**
 * ProjectedMap — Reactive per-key signal bags with diff-based sync.
 *
 * Generic utility: given a set of tracked keys, maintains a signal bag
 * per key. When sync() is called with a new value source, compares each
 * tracked key's fields and only writes to signals that actually changed.
 *
 * Used by ViewTree to project lens state into per-node signals.
 * Reusable for any computed-map-to-signals scenario.
 *
 * @example
 * ```ts
 * const map = createProjectedMap<string, { name: string; age: number }>(
 *   ["name", "age"],
 * )
 * map.track("alice", { name: "Alice", age: 30 })
 * map.sync((key) => ({ name: "Alice", age: 31 }))
 * // Only the "age" signal for "alice" updated
 * ```
 */

import { signal } from "alien-signals"

// =============================================================================
// Types
// =============================================================================

/** A signal bag for one projected value — each field is a readable signal. */
export type Projected<V> = {
  readonly [F in keyof V]: (() => V[F]) & ((value: V[F]) => void)
}

/**
 * Reactive per-key signal map with diff-based sync.
 *
 * Keys are tracked lazily (on first get/track). sync() updates only changed signals.
 */
export interface ProjectedMap<K, V> {
  /** Get the signal bag for a key. Returns undefined if not tracked. */
  get(key: K): Projected<V> | undefined

  /** Track a key with initial values (creates signal bag). Idempotent. */
  track(key: K, initial: V): Projected<V>

  /** Sync all tracked keys — calls getValue for each, updates changed signals.
   *  Keys where getValue returns undefined are pruned. */
  sync(getValue: (key: K) => V | undefined): void

  /** Number of tracked keys. */
  readonly size: number

  /** All tracked keys. */
  keys(): IterableIterator<K>
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a ProjectedMap with the specified fields.
 *
 * Each tracked key gets a signal bag with one signal per field.
 * sync() diffs each field and only writes to signals that changed.
 *
 * @param fields - Which fields of V to track as individual signals
 */
export function createProjectedMap<K, V extends Record<string, unknown>>(
  fields: readonly (keyof V & string)[],
): ProjectedMap<K, V> {
  const tracked = new Map<K, Projected<V>>()

  function createSignalBag(initial: V): Projected<V> {
    const bag: Record<string, unknown> = {}
    for (const field of fields) {
      bag[field] = signal(initial[field])
    }
    return bag as Projected<V>
  }

  return {
    get(key: K): Projected<V> | undefined {
      return tracked.get(key)
    },

    track(key: K, initial: V): Projected<V> {
      const existing = tracked.get(key)
      if (existing) return existing
      const bag = createSignalBag(initial)
      tracked.set(key, bag)
      return bag
    },

    sync(getValue: (key: K) => V | undefined): void {
      const toDelete: K[] = []
      for (const [key, bag] of tracked) {
        const newValue = getValue(key)
        if (newValue === undefined) {
          toDelete.push(key)
          continue
        }
        // Diff each field — only write signal if value changed
        for (const field of fields) {
          const oldVal = (bag[field] as () => unknown)()
          const newVal = newValue[field]
          if (oldVal !== newVal) {
            ;(bag[field] as (v: unknown) => void)(newVal)
          }
        }
      }
      // Prune keys that no longer exist
      for (const key of toDelete) {
        tracked.delete(key)
      }
    },

    get size(): number {
      return tracked.size
    },

    keys(): IterableIterator<K> {
      return tracked.keys()
    },
  }
}
