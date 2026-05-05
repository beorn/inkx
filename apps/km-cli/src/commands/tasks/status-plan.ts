/**
 * Pure planning logic for `tasks status <id> [new-status]`.
 *
 * Extracted from `status.ts` so unit tests can import it without
 * triggering the program.ts → doctor.ts → @silvery/ag-react/ui/progress
 * chain at module-load time. The action handler in `status.ts` consumes
 * the plan and applies it via repo + terminal output.
 *
 * Pure — no I/O, no commander, no createTerm.
 */

import { getMarkerForStatus, type KNode, type TaskStatus } from "@km/core"

/** Statuses accepted by `tasks status <id> <new>`. */
export const VALID_STATUSES = ["todo", "wip", "blocked", "done", "dropped"] as const

/**
 * Plan kinds.
 *
 * - `not-found` — the id didn't resolve to a task. Caller errors and exits.
 * - `view` — no `newStatus` was given; caller renders the current status.
 * - `invalid-status` — `newStatus` is non-empty but not in `VALID_STATUSES`.
 *   Caller errors with a hint listing the valid options.
 * - `set` — apply the status update and render the result line.
 */
export type StatusPlan =
  | { kind: "not-found"; id: string }
  | { kind: "view"; status: TaskStatus; marker: string; content: string; id: string }
  | { kind: "invalid-status"; given: string; valid: readonly string[] }
  | { kind: "set"; status: TaskStatus; marker: string; id: string; content: string }

/**
 * Plan the status command from a resolved task + the optional new-status arg.
 * `task === null` represents a failed lookup.
 */
export function planStatus(task: KNode | null, id: string, newStatus: string | undefined): StatusPlan {
  if (!task) return { kind: "not-found", id }

  const content = task.content ?? "(no content)"

  if (!newStatus) {
    const status = (task.item?.task?.status ?? "todo") as TaskStatus
    const marker = task.item?.task?.marker ?? "[ ]"
    return { kind: "view", status, marker, content, id: task.id }
  }

  if (!VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])) {
    return { kind: "invalid-status", given: newStatus, valid: VALID_STATUSES }
  }

  const status = newStatus as TaskStatus
  return { kind: "set", status, marker: getMarkerForStatus(status), id: task.id, content }
}
