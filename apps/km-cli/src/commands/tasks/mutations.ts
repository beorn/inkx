/**
 * Task Mutations
 *
 * Functions for modifying tasks: create, claim, release, assign, markDone.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { Task, type Repo } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { Bead } from "@km/beads"
import { resolveAssignee } from "../../utils/assignee.ts"
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
   * Surfaced as `--task-id` because the bare `--id` slot is taken by
   * the `--id` (boolean) display flag on the parent `tasks` command. */
  taskId?: string
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

  // Map `--task-id` (avoids conflicting with the `-i, --id` display flag
   // on the parent `tasks` command) onto the planner's `id` slot.
  const { node } = planNewTask(content, { ...options, id: options.taskId })
  const nodeId = repo.addNode(parentId, node)

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId }))
    return
  }

  console.log(term.green("Created task:"), nodeId.slice(-8))
}

/**
 * Mark a task as done
 */
export async function markDone(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = Task.findByPathOrId(repo, pathOrId, (r) => Bead.resolve(repo, r))
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    item: { task: { status: "done", marker: "[x]" } },
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "done" }))
    return
  }

  console.log(term.green("✓"), "Marked as done:", task.id.slice(-8))
}

/**
 * Claim a task (assign to yourself)
 */
export async function claimTask(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = Task.findByPathOrId(repo, pathOrId, (r) => Bead.resolve(repo, r))
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  const actor = resolveAssignee()
  repo.updateNode(task.id, {
    assigned_to: actor,
    item: { task: { status: "wip", marker: "[/]" } },
  })

  if (options.json) {
    console.log(
      JSON.stringify({
        id: task.id,
        status: "wip",
        assigned_to: actor,
      }),
    )
    return
  }

  console.log(term.green("◐"), "Claimed:", task.id.slice(-8))
}

/**
 * Release a claimed task
 */
export async function releaseTask(pathOrId: string | undefined, options: { json?: boolean }): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = Task.findByPathOrId(repo, pathOrId, (r) => Bead.resolve(repo, r))
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    assigned_to: undefined,
    item: { task: { status: "todo", marker: "[ ]" } },
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, status: "todo", assigned_to: null }))
    return
  }

  console.log(term.dim("○"), "Released:", task.id.slice(-8))
}

/**
 * Assign a task to a user
 */
export async function assignTask(
  pathOrId: string | undefined,
  user: string,
  options: { json?: boolean },
): Promise<void> {
  if (!pathOrId) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }

  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const task = Task.findByPathOrId(repo, pathOrId, (r) => Bead.resolve(repo, r))
  if (!task) {
    console.error(term.red(`Task not found: ${pathOrId}`))
    process.exit(1)
  }

  repo.updateNode(task.id, {
    assigned_to: user,
  })

  if (options.json) {
    console.log(JSON.stringify({ id: task.id, assigned_to: user }))
    return
  }

  console.log(term.green("→"), `Assigned to ${user}:`, task.id.slice(-8))
}
