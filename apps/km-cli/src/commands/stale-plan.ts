/**
 * Pure planner for the generic `km stale [-d N]` verb.
 *
 * Wave 4 of `@km/cli/task-bd-collapse`: where `task stale` filters open
 * tasks by `updated_at`, `km stale` extends the same idea to ANY node
 * (notes, files, sections, tasks). Same `(allNodes, days, now) →
 * { rows, cutoff }` shape as the task variant — chain-immune by
 * construction (no silvery / commander / load-repo imports).
 *
 * Differences from `tasks/stale-plan.ts`:
 *   - No status filter (a stale note is just an old note; "open"
 *     doesn't apply to non-task nodes)
 *   - Excludes folder/file container nodes by default — those don't
 *     carry meaningful `updated_at` timestamps and would dominate any
 *     "stale" listing. Caller can pass `includeContainers: true` to
 *     opt back in if needed.
 *   - For task nodes, still skips `done`/`dropped` (those are finished,
 *     not stale) so `km stale` is a strict superset of `task stale`.
 */

import type { KNode } from "@km/core"

const DAY_MS = 86_400_000
export const DEFAULT_DAYS = 14

const FINISHED_TASK_STATUSES = new Set(["done", "dropped"])
const CONTAINER_TYPES = new Set(["folder", "file", "fsfolder", "fsfile"])

export interface StaleRow {
  node: KNode
  staleness: string
}

export interface StalePlan {
  rows: StaleRow[]
  /** Effective threshold (days). Defaults to `DEFAULT_DAYS` when undefined. */
  days: number
  /** Cutoff = `now - days * DAY_MS`. Nodes with `updated_at < cutoff` are stale. */
  cutoff: number
}

/**
 * Format a relative-staleness string from a timestamp ("3 weeks ago" /
 * "2 days ago"). Pure — `now` is the reference point so tests can pin
 * time deterministically. Mirrors `tasks/stale-plan.ts` formatStaleness
 * exactly so output is consistent across surfaces.
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

interface FilterOptions {
  includeContainers?: boolean
}

export function filterStaleNodes(nodes: KNode[], days: number, now: number, options: FilterOptions = {}): KNode[] {
  const threshold = now - days * DAY_MS
  return nodes.filter((n) => {
    if (!options.includeContainers && CONTAINER_TYPES.has(n.type)) return false
    // Skip finished tasks regardless of age.
    const status = n.item?.task?.status
    if (status && FINISHED_TASK_STATUSES.has(status)) return false
    return (n.updated_at ?? 0) < threshold
  })
}

/**
 * Plan the stale-nodes command from a list of nodes + threshold + now.
 * Pure — no I/O, no repo. The action handler is the only thing that
 * calls `repo.query("*")` and `Date.now()`.
 *
 * Order matches the input — caller is responsible for sort order. The
 * action handler today exposes insertion-ish order, mirroring how
 * `task stale` behaves.
 */
export function planStale(
  allNodes: KNode[],
  days: number | undefined,
  now: number,
  options: FilterOptions = {},
): StalePlan {
  const effectiveDays = days ?? DEFAULT_DAYS
  const cutoff = now - effectiveDays * DAY_MS
  const stale = filterStaleNodes(allNodes, effectiveDays, now, options)
  const rows: StaleRow[] = stale.map((node) => ({
    node,
    staleness: formatStaleness(node.updated_at ?? 0, now),
  }))
  return { rows, days: effectiveDays, cutoff }
}
