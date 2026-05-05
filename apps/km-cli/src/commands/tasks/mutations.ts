/**
 * Task Mutations
 *
 * Functions for modifying tasks: create, claim, release, assign, markDone.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { parseTaskMetadata, extractTags, Task } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { Bead } from "@km/beads"
import { resolveAssignee } from "../../utils/assignee.ts"

/**
 * Create a task under a parent
 */
export async function createTask(
  pathOrId: string | undefined,
  content: string,
  options: { json?: boolean },
): Promise<void> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  // Parse metadata from content
  const metadata = parseTaskMetadata(content)
  const tags = extractTags(content)

  // Resolve parent
  let parentId: string | null = null
  if (pathOrId) {
    const parent = Task.findByPathOrId(repo, pathOrId, (r) => Bead.resolve(repo, r))
    if (!parent) {
      console.error(term.red(`Parent not found: ${pathOrId}`))
      process.exit(1)
    }
    parentId = parent.id
  }

  // priority dissolved as a column at SCHEMA_VERSION=11 — surface it via
  // data.tags '#P[0-4]' (canonical authored form). kmRefsTransform will
  // re-derive on parse from the H1 hashtag once the markdown is round-
  // tripped; for direct addNode (no markdown round-trip) we seed the tag
  // manually so getNodePriority() can read it.
  const allTags = metadata.priority && !tags.some((t) => /^P[0-4]$/i.test(t)) ? [...tags, metadata.priority] : tags

  const nodeId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: content,
    due_at: metadata.dueAt,
    start_at: metadata.startAt,
    data: allTags.length > 0 ? { tags: allTags } : {},
  })

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
