/**
 * OrderedSet<T> — ReadonlyArray<T> with O(1) .has()
 *
 * Wraps an array and lazily caches a Set for fast lookups.
 * Iteration order matches the array. Immutable.
 */

export type OrderedSet<T> = ReadonlyArray<T> & {
  has(value: T): boolean
}

/**
 * Create an OrderedSet from an array of items.
 * The input array is shallow-copied — safe to mutate the original after calling.
 */
export function createOrderedSet<T>(items: readonly T[]): OrderedSet<T> {
  let cachedSet: Set<T> | null = null

  function getSet(): Set<T> {
    if (cachedSet === null) {
      cachedSet = new Set(items)
    }
    return cachedSet
  }

  // Create a new array that we own, then attach .has()
  const arr = [...items] as T[] & { has(value: T): boolean }
  arr.has = (value: T): boolean => getSet().has(value)

  return arr as OrderedSet<T>
}

/** Empty ordered set — singleton, reused. */
export const EMPTY_ORDERED_SET: OrderedSet<never> = createOrderedSet([])
