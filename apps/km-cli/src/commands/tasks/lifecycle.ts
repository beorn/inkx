/**
 * Task Lifecycle Action Handlers — `task close | drop | reopen | claim | release`
 *
 * These verbs are workflow transitions, NOT raw `set status:X` field
 * writes. The L4 invariant: `close <id>` always sets `closed_at`;
 * `set status:done` never does. Property tests pin this in
 * `tasks-lifecycle-properties.test.ts` (Wave 3 of @km/cli/task-bd-collapse).
 *
 * Pure planning lives in `lifecycle-plan.ts`; this file owns I/O
 * (commander wiring, repo load, `repo.updateNode`, terminal output,
 * JSON emission). Same separation as `mutations.ts` ↔ `mutations-plan.ts`.
 *
 * Implementation note: claim/release/close/drop/reopen all flow through
 * one `applyLifecyclePlan` helper so the field shape stays consistent.
 * That helper is also the seam the property tests drive — they call
 * `applyLifecyclePlan` (not the action handler) so they don't have to
 * synthesize commander/process exit semantics.
 */

import { getMarkerForStatus, type KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { Task } from "@km/storage"
import { Bead } from "@km/beads"
import { resolvePathArg } from "@km/fs-mount"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { resolveAssignee } from "../../utils/assignee.ts"
import { type LifecyclePlan, planClaim, planClose, planDrop, planRelease, planReopen } from "./lifecycle-plan.ts"

export {
  type LifecyclePlan,
  type LifecycleStatus,
  planClaim,
  planClose,
  planDrop,
  planRelease,
  planReopen,
} from "./lifecycle-plan.ts"

/**
 * Apply a lifecycle plan to a repo node atomically.
 *
 * "Atomic" here means single `repo.updateNode` call — the plan
 * collapses status + marker + (optional) assigned_to + (optional) data
 * mutation into one update so observers can never see an
 * intermediate state (e.g. `wip` without an owner).
 *
 * Returns the resolved owner (after the update) so callers can echo it.
 * No-ops on `plan.errors.length > 0` — caller MUST check first.
 */
export function applyLifecyclePlan(repo: Repo, node: KNode, plan: LifecyclePlan): { owner: string | null } {
  if (plan.errors.length > 0 || !plan.update) {
    throw new Error(`applyLifecyclePlan called with errored plan: ${plan.errors.join("; ")}`)
  }
  const update = plan.update

  // Build the data merge for closed_at / reason tracking. Data is a
  // full-replacement column — any merge MUST start from the current
  // node.data so siblings (id, aliases, short_id, …) are preserved.
  // Mirrors closeBeadFields/dropBeadFields' currentData discipline (see
  // km-beads.close-drop-data-wipe).
  let dataPatch: Record<string, unknown> | undefined
  const currentData = (node.data ?? {}) as Record<string, unknown>
  if (update.setClosedAt) {
    dataPatch = { ...currentData, closed_at: new Date().toISOString() }
    if (update.reason) {
      // The reason key mirrors km-beads' shape: closeReason for close,
      // dropReason for drop. Status discriminates which slot to write.
      const reasonKey = update.status === "dropped" ? "dropReason" : "closeReason"
      dataPatch[reasonKey] = update.reason
    }
  } else if (update.clearClosedAt) {
    // Reopen — strip closed_at and the reason markers so a future
    // close/drop writes a fresh timestamp instead of stacking on top.
    const { closed_at: _ca, closeReason: _cr, dropReason: _dr, ...rest } = currentData
    dataPatch = { ...rest }
  }

  const updates: Partial<KNode> = {
    item: { task: { status: update.status, marker: getMarkerForStatus(update.status) } },
    updated_at: Date.now(),
  }
  if (update.assignedTo === null) updates.assigned_to = undefined
  else if (update.assignedTo !== undefined) updates.assigned_to = update.assignedTo
  if (dataPatch !== undefined) updates.data = dataPatch

  repo.updateNode(node.id, updates)

  // Compute resolved owner: explicit override wins; otherwise inherit
  // from the pre-update node (same value the caller already has).
  let owner: string | null
  if (update.assignedTo === null) owner = null
  else if (update.assignedTo !== undefined) owner = update.assignedTo
  else owner = node.assigned_to ?? null

  return { owner }
}

/** Look up a task by user-supplied ref via the canonical resolver chain. */
function findTask(repo: Repo, ref: string): KNode | null {
  return Task.findByPathOrId(repo, ref, (r) => Bead.resolve(repo, r))
}

/** Common output options for lifecycle subcommands. */
interface LifecycleOptions {
  json?: boolean
}

/** `task claim <id>` action handler. */
export async function claimTaskLifecycle(ref: string | undefined, options: LifecycleOptions): Promise<void> {
  if (!ref) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)
  const node = findTask(repo, ref)
  const actor = resolveAssignee()
  const plan = planClaim(node, ref, actor)
  if (plan.errors.length > 0) {
    for (const e of plan.errors) console.error(term.red(e))
    process.exit(1)
  }
  const result = applyLifecyclePlan(repo, node!, plan)
  if (options.json) {
    console.log(JSON.stringify({ id: node!.id, status: "wip", assigned_to: result.owner }))
    return
  }
  console.log(term.green("◐"), "Claimed:", node!.id.slice(-8))
}

/** `task release <id>` action handler. */
export async function releaseTaskLifecycle(ref: string | undefined, options: LifecycleOptions): Promise<void> {
  if (!ref) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)
  const node = findTask(repo, ref)
  const plan = planRelease(node, ref)
  if (plan.errors.length > 0) {
    for (const e of plan.errors) console.error(term.red(e))
    process.exit(1)
  }
  applyLifecyclePlan(repo, node!, plan)
  if (options.json) {
    console.log(JSON.stringify({ id: node!.id, status: "todo", assigned_to: null }))
    return
  }
  console.log(term.dim("○"), "Released:", node!.id.slice(-8))
}

/** Options bag for `task close <id> [--reason TEXT]`. */
interface CloseDropOptions extends LifecycleOptions {
  reason?: string
}

/** `task close <id> [--reason TEXT]` action handler. */
export async function closeTaskLifecycle(ref: string | undefined, options: CloseDropOptions): Promise<void> {
  if (!ref) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)
  const node = findTask(repo, ref)
  const plan = planClose(node, ref, options.reason)
  if (plan.errors.length > 0) {
    for (const e of plan.errors) console.error(term.red(e))
    process.exit(1)
  }
  applyLifecyclePlan(repo, node!, plan)
  if (options.json) {
    console.log(JSON.stringify({ id: node!.id, status: "done", reason: options.reason ?? null }))
    return
  }
  console.log(term.green("✓"), "Closed:", node!.id.slice(-8))
  if (options.reason) console.log(term.dim(`  Reason: ${options.reason}`))
}

/** `task drop <id> [--reason TEXT]` action handler. */
export async function dropTaskLifecycle(ref: string | undefined, options: CloseDropOptions): Promise<void> {
  if (!ref) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)
  const node = findTask(repo, ref)
  const plan = planDrop(node, ref, options.reason)
  if (plan.errors.length > 0) {
    for (const e of plan.errors) console.error(term.red(e))
    process.exit(1)
  }
  applyLifecyclePlan(repo, node!, plan)
  if (options.json) {
    console.log(JSON.stringify({ id: node!.id, status: "dropped", reason: options.reason ?? null }))
    return
  }
  console.log(term.yellow("⊘"), "Dropped:", node!.id.slice(-8))
  if (options.reason) console.log(term.dim(`  Reason: ${options.reason}`))
}

/** `task reopen <id>` action handler. */
export async function reopenTaskLifecycle(ref: string | undefined, options: LifecycleOptions): Promise<void> {
  if (!ref) {
    console.error(term.red("Task ID or path required"))
    process.exit(1)
  }
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)
  const node = findTask(repo, ref)
  const plan = planReopen(node, ref)
  if (plan.errors.length > 0) {
    for (const e of plan.errors) console.error(term.red(e))
    process.exit(1)
  }
  applyLifecyclePlan(repo, node!, plan)
  if (options.json) {
    console.log(JSON.stringify({ id: node!.id, status: "todo" }))
    return
  }
  console.log(term.green("↺"), "Reopened:", node!.id.slice(-8))
}
