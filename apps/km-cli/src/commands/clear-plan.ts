/**
 * Pure planner for the generic `km clear <id...> field...` verb.
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: counterpart to `set-plan.ts`.
 * Clears scalar fields by writing `null`. Like `set-plan.ts`, this file
 * MUST NOT import from `@silvery/{commander,ag-react}`, `program.ts`,
 * `load-repo.ts`, or `createTerm` — chain-immune by construction.
 *
 * Mirrors `tasks/set-clear-plan.ts` `planClearFields` but kept separate
 * so the generic top-level surface owns its own planner (the legacy
 * task-set-clear planner stays in place for back-compat with existing
 * `task set` tests).
 */

export interface ClearFieldPlan {
  updates: Record<string, unknown>
  warnings: string[]
}

/**
 * Field-key alias → KNode column. Keep in sync with set-plan.ts; both
 * files derive from the same canonical mapping (a future refactor can
 * extract this into a shared module once the field schema gets richer
 * — see `@km/cli/task-bd-collapse` Wave 1's "field schema is the single
 * source of truth").
 */
const SCALAR_FIELD_COLUMNS: Record<string, "due_at" | "start_at" | "priority" | "assigned_to"> = {
  due: "due_at",
  due_date: "due_at",
  due_at: "due_at",
  start: "start_at",
  scheduled: "start_at",
  scheduled_date: "start_at",
  start_at: "start_at",
  p: "priority",
  priority: "priority",
  assigned: "assigned_to",
  assigned_to: "assigned_to",
  owner: "assigned_to",
}

/**
 * Plan the per-field side effects of `km clear <id> field...`.
 *
 * Unlike `set`, `clear` only operates on scalar columns where "clear"
 * has well-defined semantics (i.e., the column is nullable). Clearing
 * structured fields (`type`, `parent`, `aliases`) is intentionally not
 * supported — those need targeted verbs (`km set type:`, `km move`,
 * `km set aliases:`).
 */
export function planClear(fields: readonly string[]): ClearFieldPlan {
  const updates: Record<string, unknown> = {}
  const warnings: string[] = []
  for (const field of fields) {
    const key = field.toLowerCase()
    const scalarColumn = SCALAR_FIELD_COLUMNS[key]
    if (scalarColumn) {
      updates[scalarColumn] = null
      continue
    }
    warnings.push(`Unknown field: ${key}`)
  }
  return { updates, warnings }
}
