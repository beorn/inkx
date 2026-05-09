/**
 * @silvery/selection — Occurrence path helpers
 *
 * Pure operations on `OccurrencePath` values. The path is opaque to
 * silvery-selection itself; the host defines what its segments mean.
 *
 * See `OccurrencePath` in types.ts for why path identity is required.
 */

import type { ID, OccurrencePath } from "./types.ts"

/** True when both paths are the same length and every element is `===`. */
export function pathsEqual(a: OccurrencePath | null, b: OccurrencePath | null): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * True when `prefix` is a (possibly equal) prefix of `path`.
 * Useful for "is the cursor under this subtree?" checks at render time.
 */
export function isPathPrefix(prefix: OccurrencePath, path: OccurrencePath): boolean {
  if (prefix.length > path.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return false
  }
  return true
}

/**
 * Leaf id of a path — what `cursor` is derived from.
 * Returns null for empty paths and null inputs.
 */
export function pathLeaf(path: OccurrencePath | null): ID | null {
  if (path == null || path.length === 0) return null
  return path[path.length - 1]!
}

/**
 * The id one step below `prefix` on `path`. Returns null when
 * `prefix` does not prefix `path` or `prefix` already equals `path`.
 *
 * Replaces the `directChildOnPath` walk pattern: rendering an embedded
 * card asks "given my path so far, what's the next id the cursor goes
 * through?", and gets it in O(1) without a global cursor read.
 */
export function pathChildAfter(prefix: OccurrencePath, path: OccurrencePath): ID | null {
  if (prefix.length >= path.length) return null
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return null
  }
  return path[prefix.length]!
}

/** Append `id` to `path`. Convenience for prop-drilling occurrence paths down a render tree. */
export function pathAppend(path: OccurrencePath, id: ID): OccurrencePath {
  return [...path, id]
}
