/**
 * Pure planning logic for `tasks` (list).
 *
 * Extracted from `list.ts` so unit tests can import it without triggering
 * the program.ts → doctor.ts → silvery progress chain at
 * module-load time. The action handler in `list.ts` re-exports + drives
 * this. Tests can run against a hand-built `Repo` with no terminal at all.
 *
 * The planner takes the parsed CLI shape and a `Repo` and returns either:
 *   - a `single-task` plan (positional resolved to one task — caller shows
 *     details and exits),
 *   - a `list` plan (filtered + ordered tasks plus the header context the
 *     renderer needs: optional rootNode, optional path-filter string).
 *
 * I/O lives in `list.ts`; this file is pure (no commander, no createTerm,
 * no load-repo).
 */

import { Task, type Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { Bead, normalizePriority } from "@km/beads"
import { KNode as KNodeNs, getNodePriority } from "@km/core"
import { taskPathMatches, looksLikeQuery } from "./queries.ts"
import { resolveShortId } from "../../utils/short-id.ts"

/**
 * Parsed inputs the planner reads. Subset of the CLI surface — the
 * action handler still owns rendering flags (json/flat/detail/showId/limit)
 * because they don't change *which* tasks are listed, only how they're
 * displayed.
 */
export interface PlanListInputs {
  /** Positional pathOrId arg. */
  pathOrId?: string
  /** --query flag. */
  query?: string
  /** --status flag (literal status string). */
  status?: string
  /** --priority flag (P0..P4 / 0..4). */
  priority?: string
  /** Resolved assignee handle (caller pre-resolves "me" → user). */
  assignee?: string
  /** --all flag (overrides default exclude-done filter). */
  all?: boolean
  /** --blocked flag (keep only tasks with at least one blocked-by). */
  blocked?: boolean
  /** --unblocked flag (keep only tasks with zero blocked-by). */
  unblocked?: boolean
}

/** Plan kinds. */
export type ListPlan =
  | { kind: "single-task"; task: KNode }
  | { kind: "list"; tasks: KNode[]; rootNode: KNode | null; pathFilter: string | null }
  /**
   * The user-supplied positional resolved to multiple candidates. The
   * action handler renders a "did you mean:" list and exits non-zero.
   * Short-id resolution can surface ambiguity that path-form resolution
   * masked silently — exposing it as a plan kind keeps the action
   * handler dumb (one switch over plan.kind).
   */
  | { kind: "ambiguous"; raw: string; candidates: KNode[] }

/**
 * Filter tasks by priority (canonical `P0`..`P4` form on `node.priority`).
 *
 * Accepts the same input shapes as bd: "P0".."P4" / "p0".."p4" / "0".."4".
 * Returns the input list verbatim when `priority` is undefined. Invalid
 * inputs (anything not normalizable to `P0`..`P4`) match nothing —
 * surfacing a typo as "no results" rather than silently passing through.
 */
export function filterTasksByPriority(tasks: KNode[], priority: string | undefined): KNode[] {
  if (priority === undefined) return tasks
  const normalized = normalizePriority(priority)
  if (normalized === null) return []
  return tasks.filter((t) => getNodePriority(t) === normalized)
}

/**
 * Filter tasks by blocked / unblocked state.
 *
 * Mirrors `km bd list` semantics: `--blocked` keeps only tasks with at least one
 * `blocked-by` target; `--unblocked` keeps only tasks with none. Both flags set
 * is mutually exclusive — last-flag-wins isn't ergonomic, so we treat the
 * combination as "no filter" (commander allows both, the user typed both, and
 * intersecting blocked ∧ unblocked is empty by definition).
 */
export function filterTasksByBlocked(tasks: KNode[], options: Pick<PlanListInputs, "blocked" | "unblocked">): KNode[] {
  if (options.blocked && !options.unblocked) {
    return tasks.filter((t) => Task.isBlocked(t))
  }
  if (options.unblocked && !options.blocked) {
    return tasks.filter((t) => !Task.isBlocked(t))
  }
  return tasks
}

/**
 * Filter tasks by assignee (case-insensitive exact match against `task.assigned_to`).
 * Returns input unchanged when filter is undefined.
 */
export function filterTasksByAssignee(tasks: KNode[], assignee: string | undefined): KNode[] {
  if (!assignee) return tasks
  const target = assignee.toLowerCase()
  return tasks.filter((t) => (t.assigned_to ?? "").toLowerCase() === target)
}

/**
 * Filter tasks by status options (shared across multiple resolution paths).
 * Returns only tasks matching the requested status/all flags.
 *
 * @param defaultMode - "excludeDone" excludes only done tasks (global/path-filter default);
 *                      "active" keeps only todo/wip tasks (root-scoped default)
 */
export function filterTasksByStatus(
  tasks: KNode[],
  options: Pick<PlanListInputs, "status" | "all">,
  defaultMode: "excludeDone" | "active" = "excludeDone",
): KNode[] {
  if (options.status) {
    return tasks.filter((t) => t.item?.task?.status === options.status)
  }
  if (!options.all) {
    if (defaultMode === "active") {
      return tasks.filter((t) => t.item?.task?.status === "todo" || t.item?.task?.status === "wip")
    }
    return tasks.filter((t) => t.item?.task?.status !== "done")
  }
  return tasks
}

/**
 * Resolve tasks from a query argument (--query flag or query-like positional).
 * Builds the query string with default status filters and runs it against the repo.
 */
function resolveFromQuery(repo: Repo, queryArg: string, options: PlanListInputs): KNode[] {
  let queryStr = queryArg
  if (!options.all && !queryStr.includes("status:")) {
    queryStr = `-status:done ${queryStr}`
  }
  if (options.status) {
    queryStr = `status:${options.status} ${queryStr}`
  }
  return filterTasksByBlocked(filterTasksByPriority(repo.query(queryStr), options.priority), options)
}

/**
 * Resolve tasks from a path-or-ID positional argument.
 * Returns:
 *   - `{ kind: "single-task" }` if the pathOrId points to a single task
 *     (caller should show details instead),
 *   - `{ kind: "ambiguous" }` if the bare slug typed by the user matches
 *     multiple nodes (caller renders a "did you mean:" error),
 *   - `{ kind: "subtree" }` for a subtree-scoped list (rootNode + tasks),
 *   - `{ kind: "filter" }` when the input doesn't resolve and is treated
 *     as a path-substring filter against all tasks.
 */
type PathOrIdResolution =
  | { kind: "single-task"; task: KNode }
  | { kind: "ambiguous"; candidates: KNode[] }
  | { kind: "subtree"; tasks: KNode[]; rootNode: KNode; pathFilter: null }
  | { kind: "filter"; tasks: KNode[]; rootNode: null; pathFilter: string }

function resolveFromPathOrId(repo: Repo, pathOrId: string, options: PlanListInputs): PathOrIdResolution {
  // Use the short-id resolver so a bare slug typed by the user can
  // resolve uniquely (e.g. `task move-with-rewrite-refs`) and ambiguous
  // slugs surface as candidates instead of silently falling through to
  // the path-substring filter.
  const shortIdResult = resolveShortId(repo, pathOrId)
  if (shortIdResult.candidates.length > 0) {
    return { kind: "ambiguous", candidates: shortIdResult.candidates }
  }
  const rootNode = shortIdResult.node

  if (rootNode) {
    // If the root IS a task, signal the caller to show details
    if (KNodeNs.isListItem(rootNode) && rootNode.item?.task?.marker !== undefined) {
      return { kind: "single-task", task: rootNode }
    }

    // Get tasks under this root, then apply status + priority + blocked filters.
    // Root-scoped listing defaults to active tasks only (todo + wip).
    const subtasks = Task.under(repo, rootNode.id)
    const tasks = filterTasksByBlocked(
      filterTasksByPriority(filterTasksByStatus(subtasks, options, "active"), options.priority),
      options,
    )
    return { kind: "subtree", tasks, rootNode, pathFilter: null }
  }

  // No exact match - treat as path filter (like `bun test <filter>`)
  const allTasks = filterTasksByBlocked(
    filterTasksByPriority(filterTasksByStatus(repo.getAllTasks(), options), options.priority),
    options,
  )
  const tasks = allTasks.filter((t) => taskPathMatches(repo, t, pathOrId))
  return { kind: "filter", tasks, rootNode: null, pathFilter: pathOrId }
}

/**
 * Plan the list command from inputs + a repo. Pure (the action handler
 * applies any rendering on top — JSON, flat, tree, headers).
 *
 * Returns:
 *   - `single-task` when the positional resolved to one task. The caller
 *     should display task details and stop.
 *   - `ambiguous` when the positional resolved to multiple slug-matched
 *     candidates. The caller renders a "did you mean:" error.
 *   - `list` with the filtered task list, optional rootNode (shown as a
 *     header), and optional pathFilter (shown as a `Filter: <s>` header).
 */
export function planList(repo: Repo, inputs: PlanListInputs): ListPlan {
  // Handle query option first (takes precedence).
  // Also treat positional arg as query if it looks like one.
  const queryArg = inputs.query || (inputs.pathOrId && looksLikeQuery(inputs.pathOrId) ? inputs.pathOrId : null)

  if (queryArg) {
    return {
      kind: "list",
      tasks: filterTasksByAssignee(resolveFromQuery(repo, queryArg, inputs), inputs.assignee),
      rootNode: null,
      pathFilter: null,
    }
  }

  if (inputs.pathOrId) {
    const result = resolveFromPathOrId(repo, inputs.pathOrId, inputs)
    switch (result.kind) {
      case "single-task":
        return { kind: "single-task", task: result.task }
      case "ambiguous":
        return { kind: "ambiguous", raw: inputs.pathOrId, candidates: result.candidates }
      case "subtree":
      case "filter":
        return {
          kind: "list",
          tasks: filterTasksByAssignee(result.tasks, inputs.assignee),
          rootNode: result.rootNode,
          pathFilter: result.pathFilter,
        }
    }
  }

  // Global task list (no positional arg, no query)
  const tasks = filterTasksByAssignee(
    filterTasksByBlocked(
      filterTasksByPriority(filterTasksByStatus(repo.getAllTasks(), inputs), inputs.priority),
      inputs,
    ),
    inputs.assignee,
  )
  return { kind: "list", tasks, rootNode: null, pathFilter: null }
}
