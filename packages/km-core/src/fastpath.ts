/**
 * Fast path utilities — cross-platform, allocation-free alternatives to path.join/basename/relative.
 *
 * Each function has a safe variant (validates preconditions) and a fast variant (trusts the caller).
 * The exported function picks the right one at import time based on NODE_ENV — zero runtime branching.
 *
 * Performance vs path.*:
 *   joinPath:     6-10x faster than path.join
 *   basenameFast: 1.7x faster than path.basename
 *   relativeFast: 5-16x faster than path.relative
 *   isHiddenFast: 2x faster than basename + startsWith
 *
 * See benchmarks/path-utils.bench.ts for measurements.
 */

import { sep, basename, relative } from "path"

// ---------------------------------------------------------------------------
// joinPath
// ---------------------------------------------------------------------------

function joinSafe(dir: string, name: string): string {
  if (!dir) throw new Error(`joinPath: dir is empty`)
  if (!name) throw new Error(`joinPath: name is empty`)
  if (name.includes(sep)) throw new Error(`joinPath: name contains separator: ${name}`)
  if (sep !== "/" && name.includes("/")) throw new Error(`joinPath: name contains '/': ${name}`)
  return dir + sep + name
}

function joinFast(dir: string, name: string): string {
  return dir + sep + name
}

/**
 * Fast path.join for an absolute directory + simple filename.
 * Validates preconditions in dev, zero overhead in production.
 *
 * @example joinPath("/repo/src", "file.ts") // => "/repo/src/file.ts"
 */
export const joinPath: (dir: string, name: string) => string =
  process.env.NODE_ENV === "production" ? joinFast : joinSafe

// ---------------------------------------------------------------------------
// basenameFast
// ---------------------------------------------------------------------------

/**
 * Fast path.basename — extracts the last path component.
 *
 * Handles both `/` and platform `sep` (relevant on Windows where paths may use either).
 * Falls back to path.basename for edge cases (trailing separator, empty result).
 *
 * @example basenameFast("/repo/src/file.ts") // => "file.ts"
 */
export function basenameFast(path: string): string {
  const i = path.lastIndexOf(sep)
  // On Windows, also check for / since Node accepts both separators
  const j = sep !== "/" ? Math.max(i, path.lastIndexOf("/")) : i
  if (j < 0) return path
  const result = path.slice(j + 1)
  // Trailing separator edge case — fall back to path.basename
  if (!result) return basename(path)
  return result
}

// ---------------------------------------------------------------------------
// relativeFast
// ---------------------------------------------------------------------------

/**
 * Fast path.relative for the common case where `child` is under `root`.
 *
 * Checks if `child` starts with `root + sep` and slices. Falls back to
 * path.relative for non-trivial cases (symlinks, .., different drives).
 *
 * For maximum performance when `root` is constant (e.g., repoRoot), use
 * `createRelativeFast(root)` to precompute the prefix.
 *
 * @example relativeFast("/repo", "/repo/src/file.ts") // => "src/file.ts"
 */
export function relativeFast(root: string, child: string): string {
  if (child === root) return "."
  const prefix = root + sep
  if (child.startsWith(prefix)) return child.slice(prefix.length)
  return relative(root, child)
}

/**
 * Create a precomputed relativeFast for a constant root path.
 * Avoids recomputing `root + sep` on every call (~3x faster than relativeFast).
 *
 * @example
 * const rel = createRelativeFast("/repo")
 * rel("/repo/src/file.ts") // => "src/file.ts"
 */
export function createRelativeFast(root: string): (child: string) => string {
  const prefix = root + sep
  const prefixLen = prefix.length
  return (child: string) => {
    if (child === root) return "."
    if (child.startsWith(prefix)) return child.slice(prefixLen)
    return relative(root, child)
  }
}

// ---------------------------------------------------------------------------
// isHiddenFast
// ---------------------------------------------------------------------------

/**
 * Fast hidden file check — true if the basename starts with `.` (excluding `.`, `..`, `.md`).
 *
 * 2x faster than `basename(path).startsWith(".")` because it avoids extracting
 * the basename string when the file isn't hidden (early exit via charCodeAt).
 *
 * @example isHiddenFast("/repo/.git") // => true
 * @example isHiddenFast("/repo/file.md") // => false
 */
export function isHiddenFast(path: string): boolean {
  const i = path.lastIndexOf(sep)
  // On Windows, also check for /
  const j = sep !== "/" ? Math.max(i, path.lastIndexOf("/")) : i
  const nameStart = j >= 0 ? j + 1 : 0
  if (path.charCodeAt(nameStart) !== 46 /* "." */) return false
  const name = path.slice(nameStart)
  return name !== "." && name !== ".." && name !== ".md"
}
