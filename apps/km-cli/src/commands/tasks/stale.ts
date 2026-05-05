/**
 * Task Stale Command
 *
 * Lists open tasks (todo, wip, blocked) that haven't been updated in N days.
 * Mirrors the `bd stale` pattern: a simple time-threshold filter with one knob.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { collapseAncestorsWithTypes } from "@km/tree"
import type { KNode } from "@km/core"
import { getRootPath } from "../../program.ts"
import { formatTaskWithPath, formatTaskLine } from "./formatters.ts"

const DAY_MS = 86_400_000
const DEFAULT_DAYS = 14

/** Statuses considered "open" for staleness — done/dropped tasks aren't stale, they're finished. */
const OPEN_STATUSES = new Set(["todo", "wip", "blocked"])

export interface StaleTasksOptions {
  days?: number
  detail?: boolean
  flat?: boolean
  showIds?: boolean
  json?: boolean
}

/**
 * Filter tasks to those open and not updated within `days`. `now` is injected for testability.
 * Pure — no I/O.
 */
export function filterStaleTasks(tasks: KNode[], days: number, now: number): KNode[] {
  const threshold = now - days * DAY_MS
  return tasks.filter((t) => {
    const status = t.item?.task?.status ?? "todo"
    if (!OPEN_STATUSES.has(status)) return false
    return (t.updated_at ?? 0) < threshold
  })
}

/**
 * Format a relative-staleness string from a timestamp ("3 weeks ago" / "2 days ago").
 */
export function formatStaleness(updatedAt: number, now: number): string {
  const ageMs = Math.max(0, now - updatedAt)
  const days = Math.floor(ageMs / DAY_MS)
  if (days < 1) return "today"
  if (days === 1) return "1 day ago"
  if (days < 14) return `${days} days ago`
  if (days < 60) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`
  }
  if (days < 730) {
    const months = Math.floor(days / 30)
    return months === 1 ? "1 month ago" : `${months} months ago`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? "1 year ago" : `${years} years ago`
}

/**
 * List stale tasks (CLI entrypoint).
 */
export async function listStaleTasks(options: StaleTasksOptions): Promise<void> {
  const days = options.days ?? DEFAULT_DAYS
  const resolved = resolvePathArg(undefined, getRootPath() || process.cwd())
  using repo = await loadRepo(resolved.repoRoot)

  const stale = filterStaleTasks(repo.getAllTasks(), days, Date.now())

  if (options.json) {
    console.log(JSON.stringify(stale, null, 2))
    return
  }

  if (stale.length === 0) {
    console.log(term.green(`No stale tasks (threshold: ${days} days).`))
    return
  }

  console.log(term.bold(`Stale tasks (not updated in ${days}+ days):`))
  console.log()

  const now = Date.now()
  if (options.flat) {
    for (const task of stale) {
      const ancestors = collapseAncestorsWithTypes(repo.getAncestors(task.id))
      const lines = formatTaskWithPath(repo, task, ancestors, {
        detail: options.detail,
        flat: true,
        showId: options.showIds,
      })
      const staleness = term.dim(` (${formatStaleness(task.updated_at ?? 0, now)})`)
      const last = lines.pop()
      for (const line of lines) console.log(line)
      if (last !== undefined) console.log(last + staleness)
    }
  } else {
    for (const task of stale) {
      const line = formatTaskLine(task, { detail: options.detail, showId: options.showIds })
      const staleness = term.dim(` (${formatStaleness(task.updated_at ?? 0, now)})`)
      console.log(line + staleness)
    }
  }

  console.log()
  console.log(term.dim(`${stale.length} stale task(s)`))
}
