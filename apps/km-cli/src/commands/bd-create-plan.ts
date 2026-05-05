/**
 * Pure planner for `bd create` — resolves the canonical path-form id from
 * the user's argv flags before any I/O. No silvery imports, no repo
 * lookups, no filesystem touches; just `(opts, parentInfo, prefix) → planned id`.
 *
 * Why a planner: bd's create surface has six interacting flag shapes
 * (--path, --id @path, --id @foreign, --id km-bd-form, --id leaf+--parent,
 * --id leaf-no-parent). The matrix is small but easy to break — one
 * regression at the heuristic layer mis-routed every realistic title
 * through it (the `@`-prefix smart-positional in 4621393af, reverted).
 * Lifting the matrix into a pure function lets unit tests pin every
 * cell.
 *
 * Phase 2 of the bd-split work also deleted the dead "legacy
 * inline-addNode fallback" the original IIFE returned `null` for. Every
 * supported input shape now produces a `canonicalId` (non-null return).
 * Inputs that previously fell through (`"foo.bar"` / `"foo/bar"` with
 * no --parent, no sigil) are now routed to inbox under
 * `@<prefix>/inbox/<sanitized-leaf>` — same destination bare-id auto-id
 * lands at, just with the user's literal id preserved.
 *
 * See `@km/cli/bd-create-dead-canonical-fallback` for the investigation.
 */

import { bdIdToPathForm } from "@km/beads"

export interface ResolveCanonicalIdInput {
  /** Raw `--id <custom>` value (after --path → --id elevation). May be undefined. */
  readonly customId: string | undefined
  /** Raw `--parent <id>` value. May be undefined. */
  readonly explicitParent: string | undefined
  /** Resolved parent's canonical path-form id (from frontmatter `data.id`). */
  readonly parentCanonicalId: string | null
  /**
   * Resolved parent's `fs_path` (with `.md` stripped if it was a file).
   * Used as a fallback when `parentCanonicalId` isn't set (e.g. nodes
   * loaded from disk without an explicit `id` prop).
   */
  readonly parentFsPathStripped: string | null
  /** Configured beads prefix (default `"km"`). */
  readonly prefix: string
}

/**
 * Resolve the canonical path-form id (`@<prefix>/scope/leaf`) for a
 * `bd create` invocation. Returns the resolved id; never null after
 * Phase 2's dead-fallback deletion.
 *
 * Resolution order:
 *   1. `--id @<prefix>/scope/leaf` — fully-qualified path-form, returned as-is.
 *   2. `--id @<other>/scope/leaf` — foreign sigil + slash, returned as-is.
 *   3. `--id <prefix>-scope.leaf` — bd-form, translated via bdIdToPathForm.
 *   4. `--parent X --id <leaf>` — split form, joined as `<parentPath>/<leaf>`.
 *   5. `--id <bare>` (no /, no .) without --parent — inbox-routed: `@<prefix>/inbox/<leaf>`.
 *   6. `--id <bare>` with `.` or `/` (and no parent / no sigil) — inbox-routed
 *      with the literal id preserved as the leaf segment. (Phase 2 — was
 *      the dead fallback path; now routes to the same triage zone bare
 *      auto-ids land in.)
 */
export function resolveBdCreateCanonicalId(input: ResolveCanonicalIdInput): string {
  const { customId, explicitParent, parentCanonicalId, parentFsPathStripped, prefix } = input
  const sigil = `@${prefix}/`

  // 1. Fully-qualified path-form (`@<prefix>/scope/leaf`).
  if (typeof customId === "string" && customId.startsWith(sigil)) {
    return customId
  }
  // 2. Foreign sigil (`@otherprefix/scope/leaf`) — pass through.
  if (typeof customId === "string" && customId.startsWith("@") && customId.includes("/")) {
    return customId
  }
  // 3. Bd-form (`<prefix>-scope.leaf`) — translate to path-form.
  if (typeof customId === "string" && customId.startsWith(`${prefix}-`)) {
    const path = bdIdToPathForm(customId, prefix)
    if (path) return path
    // bdIdToPathForm only returns null for empty strings post-prefix-strip
    // ("km-" or empty). Fall through to inbox routing for the degenerate
    // case so callers always get a usable id back.
  }
  // 4. Split form (`--parent <scope> --id <leaf>`). Build canonical from
  //    the parent's path-form + leaf slug. Prefer the parent's canonical
  //    `data.id` when set; fall back to the parent's fs_path (sigil-
  //    prepended if missing).
  if (explicitParent && typeof customId === "string") {
    const normalizedFromFs = parentFsPathStripped
      ? parentFsPathStripped.startsWith(sigil) || parentFsPathStripped.startsWith("@")
        ? parentFsPathStripped
        : `${sigil}${parentFsPathStripped}`
      : null
    const parentPath = parentCanonicalId ?? normalizedFromFs
    if (parentPath) {
      return `${parentPath}/${customId}`
    }
  }
  // 5/6. --id given, no --parent (or split form failed to resolve a parent
  //      path). Route to inbox under the configured prefix. Mirrors
  //      `bdIdToPathForm`'s no-dot inbox routing (`km-q5hji` → `@km/inbox/q5hji`).
  //
  //      For ids that previously fell through to the dead fallback
  //      (`"foo.bar"`, `"foo/bar"` etc.), keep the literal leaf string —
  //      letting the user see exactly the id they typed in their inbox.
  if (typeof customId === "string") {
    return `${sigil}inbox/${customId}`
  }
  // Phase 2: every shape now produces an id. The branchless return is
  // a TS guarantee that nobody calls this without a customId, since
  // bd-create's caller short-circuits the bare-no-id case before this
  // helper runs (it materializes via renderInboxCapture instead).
  // Keeping a runtime fallback for defense-in-depth in case future
  // refactors call this with undefined customId.
  return `${sigil}inbox/unknown`
}
