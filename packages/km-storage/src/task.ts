/**
 * Task — domain interface (namespace) for task-shaped KNodes.
 *
 * Tasks are KNodes that carry `item.task` (a checkbox marker + status).
 * `Task` is the peer of `Bead` (in `@km/beads`): a Bead is a task that
 * additionally lives under the configured `beads.roots` and carries bd
 * identity (`data.id` / `data.short_id`). Anything that's true of a Task
 * is true of a Bead; the reverse isn't.
 *
 * Lives in `@km/storage` because the Repo-bound queries (`under`,
 * `findByPathOrId`, `tree`) need the SQLite-backed index. The pure
 * KNode predicates (`isTask`, `isBlocked`) could live in `@km/core`,
 * but co-locating with the Repo-bound ops keeps the namespace single-
 * surface for callers (`Task.*` is one import).
 *
 * Namespace conventions (mirrors `KTree`, `KNode`, `Bead`):
 *  - declaration-merged `interface + const` is unnecessary here because
 *    `Task` doesn't introduce a new value type — a Task IS a KNode. The
 *    namespace is a `const` only; consumers type values as `KNode`.
 *  - Repo is the FIRST argument of every Repo-bound function.
 */

import { KNode } from "@km/core"
import type { Repo } from "./repo/repo.ts"

/**
 * Task ancestor entry returned by `Task.tree` — the task plus a flat
 * list of ancestor KNodes from root to parent.
 */
export interface TaskTreeEntry {
  task: KNode
  ancestors: KNode[]
}

/**
 * Resolver callback for `Task.findByPathOrId`. Returns the canonical
 * node id (ULID) for a user-supplied alias / short-id, or `null` when
 * unknown. Defaults to a no-op resolver (path-only lookup); callers
 * that need bd-id resolution pass `Bead.resolve` from `@km/beads`.
 */
export type ShortIdResolver = (ref: string) => string | null

export const Task = {
  /** Pure predicate — does this node carry task data (a checkbox)? */
  isTask(node: KNode): boolean {
    return KNode.isTask(node)
  },

  /**
   * Pure predicate — does this task have at least one open blocker via
   * `data.props["blocked-by"]`?
   *
   * Mirrors the bd shape: prop type "link" carries a single `target`,
   * type "list" carries `values[].target`. A task with no `blocked-by`
   * prop, or with the prop present but empty, counts as unblocked.
   *
   * Note: this is the structural shape check. It does NOT walk the
   * blocker chain to see if the blocker is itself done. For that, use
   * `Bead.isBlocked` (which reads blocker status via Repo).
   */
  isBlocked(task: KNode): boolean {
    const data = task.data as Record<string, unknown> | undefined
    const props = data?.props as
      | Record<string, { type?: string; target?: string; values?: Array<{ target?: string }> }>
      | undefined
    const bb = props?.["blocked-by"]
    if (!bb) return false
    if (bb.type === "link") return Boolean(bb.target)
    if (bb.type === "list") return Array.isArray(bb.values) && bb.values.some((v) => Boolean(v?.target))
    return false
  },

  /**
   * All tasks under a given subtree root. Walks `repo.getSubtree(rootId)`
   * and filters to nodes carrying `item.task`.
   */
  under(repo: Repo, rootId: string): KNode[] {
    const subtree = repo.getSubtree(rootId)
    return subtree.filter((n) => n.item?.task?.marker !== undefined || n.item?.task?.status !== undefined)
  },

  /**
   * Resolve a user-supplied path-or-id reference to a single KNode.
   *
   * Resolution order:
   *   1. `shortIdResolver(ref)` — opt-in bd-form / canonical-id lookup
   *      (callers pass `Bead.resolve` to wire this up)
   *   2. `repo.resolveNode(ref)` — smart path resolver (handles explicit
   *      paths, relative paths, bare names, ULID prefix/suffix, content)
   *   3. `cwd-relative` fallback for bare relative paths typed inside a
   *      subdir
   *
   * Returns the matched KNode or `null`.
   */
  findByPathOrId(repo: Repo, ref: string, shortIdResolver?: ShortIdResolver): KNode | null {
    if (!ref?.trim()) return null

    if (shortIdResolver) {
      const nodeId = shortIdResolver(ref)
      if (nodeId) {
        const node = repo.getNode(nodeId)
        if (node) return node
      }
    }

    const byPath = repo.resolveNode(ref)
    if (byPath) return byPath

    if (!ref.startsWith("/") && !ref.includes("\0")) {
      const cwdRelative = `${process.cwd()}/${ref}`
      const byCwdRelative = repo.resolveNode(cwdRelative)
      if (byCwdRelative) return byCwdRelative
    }

    return null
  },

  /**
   * Build per-task ancestor info for a list of tasks. Returns one entry
   * per input task with `task` and `ancestors` (root-to-parent KNode list).
   *
   * The CLI helper that previously lived in `apps/km-cli/src/commands/
   * tasks/queries.ts` (as `buildTaskTree`) added type-suffixed display
   * collapsing on top of this — that's a CLI concern and stays in CLI;
   * `Task.tree` returns the structural backbone.
   */
  tree(repo: Repo, tasks: KNode[]): TaskTreeEntry[] {
    return tasks.map((task) => ({
      task,
      ancestors: repo.getAncestors(task.id),
    }))
  },
} as const
