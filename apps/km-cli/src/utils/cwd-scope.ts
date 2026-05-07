/**
 * `km task .` — explicit cwd scoping helper.
 *
 * The lighter alternative to git-style auto-detection: the user types
 * `.` and the CLI scopes the task list to the cwd-relative subtree of
 * the current vault. From `~/vault/@km/storage` it lists tasks under
 * `@km/storage/`; from the vault root it lists everything; from
 * outside any vault it errors loudly.
 *
 * The helper returns either:
 *   - `{ kind: "scope", path }` — relative path from vault root (empty
 *     string when cwd === vault root). Caller passes `path` in as the
 *     `pathOrId` so the existing planner handles subtree filtering.
 *   - `{ kind: "no-vault" }` — cwd isn't under a `.km/` ancestor.
 *     Caller emits a sharp error and exits non-zero.
 *
 * Pure function over the inputs (cwd + vault-finder). No I/O at the
 * helper boundary; the `findKmRootFromPath` call is the only place
 * that touches the filesystem and it's resolved before the helper
 * runs.
 */

import { dirname, relative, resolve } from "node:path"
import { findKmRootFromPath } from "@km/fs-mount"

/** Result of resolving the cwd into a task-scope filter. */
export type CwdScope = { kind: "scope"; vaultRoot: string; relativePath: string } | { kind: "no-vault" }

/**
 * Compute the cwd scope. Walks up from `cwd` looking for a `.km/`
 * directory; returns the relative path between vault root and cwd.
 *
 * @param cwd - Absolute path to interpret as the cwd. Defaults to
 *   `process.cwd()` so callers can usually omit it; tests pass a
 *   synthetic path to keep the suite hermetic.
 */
export function resolveCwdScope(cwd: string = process.cwd()): CwdScope {
  const absolute = resolve(cwd)
  const kmDir = findKmRootFromPath(absolute)
  if (!kmDir) return { kind: "no-vault" }
  const vaultRoot = dirname(kmDir)
  const rel = relative(vaultRoot, absolute)
  // `relative(root, root)` returns `""` — the empty string signals
  // "vault-root scope" to the caller (no subtree filter, list
  // everything). Anything else is the relative subtree path.
  return { kind: "scope", vaultRoot, relativePath: rel }
}
