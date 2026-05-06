/**
 * Task Mutations
 *
 * `createTask` — `task new <content>` action handler. Lifecycle verbs
 * (claim, release, close, drop, reopen) live in `./lifecycle.ts` after
 * task-bd-collapse Wave 3 — they're workflow transitions with
 * source-state validation, not raw field writes.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { type Repo } from "@km/storage"
import { Task } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { Bead } from "@km/beads"
import { planNewTask } from "./mutations-plan.ts"

// Re-export the planner so existing imports keep working.
export { planNewTask, type PlanNewTaskOptions, type PlannedTaskNode } from "./mutations-plan.ts"

/**
 * Options for `tasks --new`. Flags surface bead-frontmatter fields so a
 * task can be created with the same shape `bd create` produces, without
 * routing through bd. Pure extension — every flag is optional.
 */
export interface CreateTaskOptions {
  json?: boolean
  /** Bead-style type tag (bug, feature, epic, …). `task` is implicit and
   * stays untagged. Mirrored into `data.tags` next to priority. */
  type?: string
  /** Explicit canonical id (path-form or bare scope/slug). Stored at
   * `data.id` so `tasks <id>` resolves it. Skips the auto-id helper.
   * The `-i, --id` boolean display flag on the parent `tasks` command
   * was renamed to `--show-ids`, freeing the `--id <id>` slot for this
   * create-time string flag. */
  id?: string
  /** Comma-separated alias list, written to `data.aliases`. */
  aliases?: string
  /** Explicit parent ref (id, path, or filename). Resolved via
   * `repo.resolveNode` + `repo.resolveByName`. Overrides the positional
   * `pathOrId` argument when both are given. */
  parent?: string
  /** Priority hashtag value (P0..P4 / 0..4). Mirrored into `data.tags`. */
  priority?: string
  /** Initial assignee. Stored at `node.assigned_to`. */
  owner?: string
  /** Natural-language due date (`tmrw`, `friday`, `+2w`, ISO). Parsed via
   * `parseDate` in the planner; bad input aborts before mutating. */
  due?: string
  /** Natural-language start/scheduled date. Same parsing as `due`. */
  start?: string
}

/**
 * Resolve the parent for `tasks --new`. `--parent` flag wins; the
 * positional `pathOrId` is the bd-compat fallback. Returns null when no
 * parent was specified, or when the user's input failed to resolve.
 */
function resolveCreateParent(
  repo: Repo,
  pathOrId: string | undefined,
  options: Pick<CreateTaskOptions, "parent">,
): { parentId: string | null; error?: string } {
  const ref = options.parent ?? pathOrId
  if (!ref) return { parentId: null }
  const direct = Task.findByPathOrId(repo, ref, (r) => Bead.resolve(repo, r))
  if (direct) return { parentId: direct.id }
  // `--parent` allows arbitrary refs (path / name / id). Try the lower-
  // level resolvers as a fallback so a path like `@km/scope` reparents.
  if (options.parent) {
    const fallback = repo.resolveNode(ref) ?? repo.resolveByName(ref)
    if (fallback) return { parentId: fallback.id }
  }
  return { parentId: null, error: `Parent not found: ${ref}` }
}

/**
 * Create a task under a parent
 */
export async function createTask(
  pathOrId: string | undefined,
  content: string,
  options: CreateTaskOptions,
): Promise<void> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const { parentId, error } = resolveCreateParent(repo, pathOrId, options)
  if (error) {
    console.error(term.red(error))
    process.exit(1)
  }

  // `--id <id>` flows directly into the planner's `id` slot. The display
  // flag that used to claim `-i, --id` is now `--show-ids`, so the create
  // surface gets the natural `--id` name.
  const { node, errors } = planNewTask(content, options)
  if (errors.length > 0) {
    for (const err of errors) console.error(term.red(err))
    process.exit(1)
  }
  const nodeId = repo.addNode(parentId, node)

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId }))
    return
  }

  console.log(term.green("Created task:"), nodeId.slice(-8))
}
