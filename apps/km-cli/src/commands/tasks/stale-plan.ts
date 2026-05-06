/**
 * Pure planning logic for `tasks stale`.
 *
 * Extracted from `stale.ts` so unit tests can import the filter +
 * relative-time helpers + planner without triggering the program.ts →
 * doctor.ts → silvery progress chain at module-load time.
 *
 * The action handler in `stale.ts` consumes the plan and renders it via
 * terminal / JSON output. The plan itself is `(allTasks, days, now) →
 * { rows, cutoff }` — fully deterministic given an injected `now`, so
 * tests can pin time without freezing the system clock.
 */

import type { KNode } from "@km/core"

const DAY_MS = 86_400_000
export const DEFAULT_DAYS = 14

/**
 * Statuses considered "open" for staleness — done/dropped tasks aren't
 * stale, they're finished.
 */
const OPEN_STATUSES = new Set(["todo", "wip", "blocked"])

/**
 * Filter tasks to those open and not updated within `days`. `now` is
 * injected for testability. Pure — no I/O.
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
 * Format a relative-staleness string from a timestamp ("3 weeks ago" /
 * "2 days ago"). Pure — `now` is the reference point so tests can pin
 * time deterministically.
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
 * One row in a stale-tasks plan — the task itself plus the precomputed
 * relative-time string the renderer appends to each line.
 */
export interface StaleRow {
  task: KNode
  staleness: string
}

/**
 * Plan returned by `planStale`. The action handler renders rows in
 * order, prefixes the header `Stale tasks (not updated in <days>+ days)`,
 * and appends the per-row staleness suffix.
 */
export interface StalePlan {
  rows: StaleRow[]
  /** Effective threshold (days). Defaults to `DEFAULT_DAYS` when caller passes `undefined`. */
  days: number
  /** Cutoff timestamp = `now - days * DAY_MS`. Tasks with `updated_at < cutoff` are stale. */
  cutoff: number
}

/**
 * Plan the stale-tasks command from a list of tasks + threshold + now.
 * Pure — no I/O, no repo. The action handler in `stale.ts` is the only
 * thing that calls `repo.getAllTasks()` and `Date.now()`.
 *
 * Order matches the input: callers are responsible for sort order if
 * they want one. Today, `Repo.getAllTasks()` returns insertion-ish
 * order, which the existing CLI exposes verbatim — preserve that here
 * so the I/O layer doesn't see a behavior change.
 */
export function planStale(allTasks: KNode[], days: number | undefined, now: number): StalePlan {
  const effectiveDays = days ?? DEFAULT_DAYS
  const cutoff = now - effectiveDays * DAY_MS
  const stale = filterStaleTasks(allTasks, effectiveDays, now)
  const rows: StaleRow[] = stale.map((task) => ({
    task,
    staleness: formatStaleness(task.updated_at ?? 0, now),
  }))
  return { rows, days: effectiveDays, cutoff }
}
