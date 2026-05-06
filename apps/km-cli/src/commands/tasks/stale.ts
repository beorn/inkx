/**
 * Task Stale Command
 *
 * Lists open tasks (todo, wip, blocked) that haven't been updated in N days.
 * Mirrors the `bd stale` pattern: a simple time-threshold filter with one knob.
 *
 * Filtering + relative-time formatting live in `./stale-plan.ts` (pure);
 * this file owns the I/O surface — repo load, terminal coloring, JSON
 * emission, and ancestor-collapsed path display.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes } from "@km/tree"
import { getRootPath } from "../../program.ts"
import { formatTaskWithPath, formatTaskLine } from "./formatters.ts"
import { planStale } from "./stale-plan.ts"
import { emitJson, normalizeJsonJq } from "../../utils/jq.ts"

// Re-export the planner + helpers so existing imports keep working.
export {
  filterStaleTasks,
  formatStaleness,
  planStale,
  DEFAULT_DAYS,
  type StalePlan,
  type StaleRow,
} from "./stale-plan.ts"

export interface StaleTasksOptions {
  days?: number
  detail?: boolean
  flat?: boolean
  showIds?: boolean
  json?: boolean
  jq?: string
}

/**
 * List stale tasks (CLI entrypoint).
 */
export async function listStaleTasks(options: StaleTasksOptions): Promise<void> {
  const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
  using repo = await loadRepo(resolved.repoRoot)

  const plan = planStale(repo.getAllTasks(), options.days, Date.now())

  const { json, jq } = normalizeJsonJq(options)
  if (json) {
    await emitJson(
      plan.rows.map((r) => r.task),
      jq,
    )
    return
  }

  if (plan.rows.length === 0) {
    console.log(term.green(`No stale tasks (threshold: ${plan.days} days).`))
    return
  }

  console.log(term.bold(`Stale tasks (not updated in ${plan.days}+ days):`))
  console.log()

  if (options.flat) {
    for (const { task, staleness } of plan.rows) {
      const ancestors = collapseAncestorsWithTypes(repo.getAncestors(task.id))
      const lines = formatTaskWithPath(repo, task, ancestors, {
        detail: options.detail,
        flat: true,
        showId: options.showIds,
      })
      const stalenessSuffix = term.dim(` (${staleness})`)
      const last = lines.pop()
      for (const line of lines) console.log(line)
      if (last !== undefined) console.log(last + stalenessSuffix)
    }
  } else {
    for (const { task, staleness } of plan.rows) {
      const line = formatTaskLine(task, { detail: options.detail, showId: options.showIds })
      console.log(line + term.dim(` (${staleness})`))
    }
  }

  console.log()
  console.log(term.dim(`${plan.rows.length} stale task(s)`))
}
