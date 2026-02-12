/**
 * O(1) child index lookup using WeakMap-based caching.
 *
 * repo.getChildren() returns cached array references (ChildrenCache in repo.ts).
 * We build an id→index Map lazily per unique array reference, giving O(1)
 * lookups after the first access. When the children cache is busted (mutation),
 * a new array is returned and the stale WeakMap entry is naturally GC'd.
 *
 * This eliminates O(N) findIndex() scans — critical for parents with 3000+ children
 * where j/k navigation was doing 3700 string comparisons per keypress.
 */

const childIndexCache = new WeakMap<readonly { id: string }[], Map<string, number>>()

export function indexOfChild(children: { id: string }[], childId: string): number {
  let map = childIndexCache.get(children)
  if (!map) {
    map = new Map()
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child) map.set(child.id, i)
    }
    childIndexCache.set(children, map)
  }
  return map.get(childId) ?? -1
}
