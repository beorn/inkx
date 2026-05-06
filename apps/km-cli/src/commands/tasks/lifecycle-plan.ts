/**
 * Pure planners for `task close | drop | reopen | claim | release`.
 *
 * Lifecycle verbs are workflow transitions, NOT raw `set status:X` field
 * writes (per task-bd-collapse Wave 3). The planners here encode the
 * source-state validation + the target field shape; the action handler
 * in `lifecycle.ts` handles I/O (repo load, terminal output, JSON
 * emission). Same pattern as `mutations-plan.ts` / `set-clear-plan.ts` —
 * unit-testable without booting commander or silvery.
 *
 * The "lifecycle vs set" semantic distinction is the L4 invariant for
 * Wave 3: `close <id>` always sets `closed_at`; `set status:done` never
 * does. Property tests in `tasks-lifecycle-properties.test.ts` pin this.
 */

import type { KNode, TaskStatus } from "@km/core"

/** Permitted lifecycle states on a task. */
export type LifecycleStatus = Extract<TaskStatus, "todo" | "wip" | "done" | "dropped">

/**
 * Outcome of a lifecycle planner — either a partial-node update to
 * apply (errors empty) or one or more validation errors (update absent).
 */
export interface LifecyclePlan {
  errors: string[]
  /** When `errors.length === 0`, the partial node + assigned_to delta. */
  update?: {
    /** New status; always present on a successful plan. */
    status: LifecycleStatus
    /** Owner write — `string` to set, `null` to clear, `undefined` to leave. */
    assignedTo?: string | null
    /** Optional reason recorded on data (close/drop). */
    reason?: string
    /** When true, clear `closed_at` (reopen). */
    clearClosedAt?: boolean
    /** When true, set `closed_at` to current ISO (close/drop). */
    setClosedAt?: boolean
  }
}

/** Read the current task status off a KNode (defaults to `todo`). */
function statusOf(node: KNode): LifecycleStatus {
  const status = node.item?.task?.status as LifecycleStatus | undefined
  return status ?? "todo"
}

/** Read the current owner off a KNode (`null` when unassigned). */
function ownerOf(node: KNode): string | null {
  return node.assigned_to ?? null
}

/**
 * Plan a `task claim <id>`.
 *
 * Validation:
 *   - Already-claimed-by-someone-else → error with the current owner.
 *   - Already-claimed-by-self → no-op success (idempotent).
 *   - Done/dropped → error (claim a closed task is wrong; reopen first).
 *
 * Effect: status → `wip`, marker → `[/]`, assigned_to → actor.
 */
export function planClaim(node: KNode | null, ref: string, actor: string): LifecyclePlan {
  if (!node) return { errors: [`Task not found: ${ref}`] }
  const status = statusOf(node)
  const currentOwner = ownerOf(node)

  if (status === "done" || status === "dropped") {
    return { errors: [`Task is ${status}; reopen before claiming: ${ref}`] }
  }

  if (currentOwner && currentOwner !== actor) {
    return { errors: [`Task already claimed by ${currentOwner}: ${ref}`] }
  }

  return {
    errors: [],
    update: {
      status: "wip",
      assignedTo: actor,
    },
  }
}

/**
 * Plan a `task release <id>`.
 *
 * Validation:
 *   - Currently unclaimed → error (nothing to release; signals user
 *     mistake rather than silent no-op).
 *   - Done/dropped → error (release on a closed task is meaningless).
 *
 * Effect: status → `todo`, marker → `[ ]`, assigned_to → null.
 */
export function planRelease(node: KNode | null, ref: string): LifecyclePlan {
  if (!node) return { errors: [`Task not found: ${ref}`] }
  const status = statusOf(node)
  const currentOwner = ownerOf(node)

  if (status === "done" || status === "dropped") {
    return { errors: [`Task is ${status}; reopen before releasing: ${ref}`] }
  }

  if (!currentOwner) {
    return { errors: [`Task is not claimed: ${ref}`] }
  }

  return {
    errors: [],
    update: {
      status: "todo",
      assignedTo: null,
    },
  }
}

/**
 * Plan a `task close <id> [--reason TEXT]`.
 *
 * Validation:
 *   - Already done → error (close-on-closed is a user mistake; the
 *     reopen→close pattern is explicit).
 *
 * Effect: status → `done`, marker → `[x]`, closed_at → now ISO,
 * optional reason recorded on data.closeReason. The `closed_at` field
 * is the L4 distinguisher from `set status:done` (which never touches
 * closed_at).
 */
export function planClose(node: KNode | null, ref: string, reason?: string): LifecyclePlan {
  if (!node) return { errors: [`Task not found: ${ref}`] }
  const status = statusOf(node)

  if (status === "done") {
    return { errors: [`Task is already done: ${ref}`] }
  }

  return {
    errors: [],
    update: {
      status: "done",
      reason,
      setClosedAt: true,
    },
  }
}

/**
 * Plan a `task drop <id> [--reason TEXT]`.
 *
 * Validation:
 *   - Already dropped → error (parallel to close-on-closed).
 *
 * Effect: status → `dropped`, marker → `[-]`, closed_at → now ISO,
 * optional reason recorded on data.dropReason.
 */
export function planDrop(node: KNode | null, ref: string, reason?: string): LifecyclePlan {
  if (!node) return { errors: [`Task not found: ${ref}`] }
  const status = statusOf(node)

  if (status === "dropped") {
    return { errors: [`Task is already dropped: ${ref}`] }
  }

  return {
    errors: [],
    update: {
      status: "dropped",
      reason,
      setClosedAt: true,
    },
  }
}

/**
 * Plan a `task reopen <id>`.
 *
 * Validation:
 *   - Source must be `done` or `dropped` (todo/wip → error; that's not
 *     reopen, that's no-op or release).
 *
 * Effect: status → `todo`, closed_at cleared, close/drop reason markers
 * cleared. `assigned_to` is also cleared so the bead lifecycle
 * invariant "todo never has owner" holds — reopening leaves the user
 * back at the unclaimed state, and they can `task claim <id>` again to
 * resume work. (An alternative design would preserve owner-on-reopen,
 * but it weakens the invariant: a fuzz-tested "todo ⟹ no owner" pin
 * catches enough drift that we keep the strict shape.)
 */
export function planReopen(node: KNode | null, ref: string): LifecyclePlan {
  if (!node) return { errors: [`Task not found: ${ref}`] }
  const status = statusOf(node)

  if (status !== "done" && status !== "dropped") {
    return { errors: [`Task is ${status}; reopen requires done or dropped: ${ref}`] }
  }

  return {
    errors: [],
    update: {
      status: "todo",
      assignedTo: null,
      clearClosedAt: true,
    },
  }
}
