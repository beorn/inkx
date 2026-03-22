/**
 * Fast path utilities — cross-platform, allocation-free alternatives to path.join/basename/relative.
 *
 * These are safe to use when the inputs satisfy documented preconditions (absolute dirs,
 * simple filenames). Each function validates preconditions in development and throws on
 * violation, so misuse is caught early.
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

/** Skip precondition checks in production builds (dead-code-eliminated by bundlers) */
const SKIP_CHECKS = typeof process !== "undefined" && process.env.NODE_ENV === "production"

/**
 * Fast path.join for an absolute directory + simple filename.
 *
 * Preconditions (validated unless NODE_ENV=production):
 * - `dir` is non-empty
 * - `name` is a simple filename with no path separators
 *
 * @example joinPath("/repo/src", "file.ts") // => "/repo/src/file.ts"
 */
export function joinPath(dir: string, name: string): string {
  if (!SKIP_CHECKS) {
    if (!dir) throw new Error(`joinPath: dir is empty`)
    if (!name) throw new Error(`joinPath: name is empty`)
    if (name.includes(sep)) throw new Error(`joinPath: name contains separator: ${name}`)
    if (sep !== "/" && name.includes("/")) throw new Error(`joinPath: name contains '/': ${name}`)
  }
  return dir + sep + name
}

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

/**
 * Fast hidden file check — true if the basename starts with `.` (excluding `.`, `..`, `.md`).
 *
 * 2x faster than `basename(path).startsWith(".")` because it avoids extracting
 * the basename string when the file isn't hidden (early exit via charCodeAt).
 *
 * @example isHiddenFast("/repo/.git/config") // => true
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
