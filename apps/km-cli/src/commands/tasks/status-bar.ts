/**
 * Status-bar header — `bun km task` and friends print a one-liner
 * summary above the rendered task table:
 *
 *   @km — 12 open (3 wip · 2 blocked · 7 todo) — 4 closed this week
 *
 * Pure formatter — no I/O, no terminal, no repo. The action handler
 * harvests the inputs (workspace tasks + scope label) and feeds them
 * through `buildStatusBar`. Tests can pin every variation without
 * booting the program.ts → silvery import chain.
 *
 * Why workspace-wide (not filter-scoped):
 *   The header tells the user where the *workspace* stands, not what
 *   the current filter happened to return. Running `task ready` on a
 *   board with 12 open tasks should still show "12 open" — the summary
 *   is anchored to the scope, not the filter, so users get steady
 *   ground regardless of the verb they typed.
 *
 * Pluralization, Oxford-style middle-dot separators, ISO-Monday week
 * boundaries — all anchored here so the renderer never has to think
 * about format. The dot separator (`·`, U+00B7) matches the visual
 * weight of the surrounding em-dashes (`—`, U+2014) without crowding.
 */

import type { KNode } from "@km/core"

/**
 * Open-status buckets we summarize.  "open" = todo + wip + blocked.
 * `done` and `dropped` are NOT open. Anything else (legacy data,
 * status: undefined) gets ignored — the header is a fast at-a-glance
 * summary, not an audit log.
 */
type OpenStatus = "todo" | "wip" | "blocked"

/**
 * Counts that drive the header. Exposed so callers can pin the
 * arithmetic without going through the format string.
 */
export interface StatusBarCounts {
  open: number
  wip: number
  blocked: number
  todo: number
  closedThisWeek: number
}

/**
 * Compute the counts that feed the status bar.
 *
 * Pure over an array of `KNode` — no repo, no clock magic. The
 * caller passes in `now` so tests can pin the Monday boundary.
 */
export function computeStatusBarCounts(tasks: readonly KNode[], now: Date): StatusBarCounts {
  const monday = startOfWeekMonday(now).getTime()
  let wip = 0
  let blocked = 0
  let todo = 0
  let closedThisWeek = 0

  for (const t of tasks) {
    const status = t.item?.task?.status
    switch (status as OpenStatus | "done" | "dropped" | undefined) {
      case "wip":
        wip++
        break
      case "blocked":
        blocked++
        break
      case "todo":
        todo++
        break
      default:
        break
    }
    if (status === "done" || status === "dropped") {
      const closedAt = readClosedAt(t)
      if (closedAt !== null && closedAt >= monday) {
        closedThisWeek++
      }
    }
  }

  return { open: wip + blocked + todo, wip, blocked, todo, closedThisWeek }
}

/**
 * Format the counts + scope label into the header line.
 *
 * Returns an empty string when the workspace is empty AND no tasks
 * have been closed this week — in that case there's nothing useful
 * to show, and printing "@km — 0 open — 0 closed this week" above
 * "No tasks found" is just noise.
 *
 * Examples:
 *   formatStatusBar({...}, "@km")
 *   → "@km — 12 open (3 wip · 2 blocked · 7 todo) — 4 closed this week"
 *
 *   formatStatusBar({open: 0, ..., closedThisWeek: 4}, "@km")
 *   → "@km — 0 open — 4 closed this week"
 *
 *   formatStatusBar({open: 1, wip: 0, blocked: 0, todo: 1, closedThisWeek: 0}, "@km")
 *   → "@km — 1 open (1 todo) — 0 closed this week"
 */
export function formatStatusBar(counts: StatusBarCounts, scopeLabel: string): string {
  if (counts.open === 0 && counts.closedThisWeek === 0) return ""

  const parts: string[] = []
  parts.push(scopeLabel)

  // Open breakdown — only emit non-zero buckets to keep the line tight
  // ("@km — 5 open (5 todo)" reads better than "5 open (0 wip · 0 blocked · 5 todo)").
  // Order matches the engineer's mental model: wip first (in-flight), then
  // blocked (stuck), then todo (queue).
  const breakdown: string[] = []
  if (counts.wip > 0) breakdown.push(`${counts.wip} wip`)
  if (counts.blocked > 0) breakdown.push(`${counts.blocked} blocked`)
  if (counts.todo > 0) breakdown.push(`${counts.todo} todo`)

  const openSegment = breakdown.length > 0 ? `${counts.open} open (${breakdown.join(" · ")})` : `${counts.open} open`
  parts.push(openSegment)

  parts.push(`${counts.closedThisWeek} closed this week`)

  return parts.join(" — ")
}

/**
 * One-shot helper — compute counts and format in one go. The action
 * handler typically uses this directly; the two-step variant is
 * available for tests that want to pin counts and format separately.
 */
export function buildStatusBar(tasks: readonly KNode[], now: Date, scopeLabel: string): string {
  return formatStatusBar(computeStatusBarCounts(tasks, now), scopeLabel)
}

/**
 * Start of ISO week (Monday 00:00 local time). ISO calendars start on
 * Monday — sticking to the standard avoids "did Sunday's close land
 * in this week or last?" ambiguity. `now`'s timezone is honored.
 *
 * Exposed for testing; production calls go through the helpers above.
 */
export function startOfWeekMonday(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  // Date.getDay(): 0=Sunday, 1=Monday, … 6=Saturday.
  // Want offset to most recent Monday: Mon=0, Tue=-1, …, Sun=-6.
  const dayOfWeek = d.getDay()
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d.setDate(d.getDate() + offsetToMonday)
  return d
}

/**
 * Read `closed_at` from a node's data blob and return a millisecond
 * timestamp, or null when missing / unparseable. Defensively handles
 * legacy nodes that stored it as a number (Date.now()) or as a
 * non-ISO string — `Date.parse()` is permissive enough to land on
 * the right answer or give us NaN to filter on.
 */
function readClosedAt(node: KNode): number | null {
  const raw = (node.data as Record<string, unknown> | undefined)?.closed_at
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  if (typeof raw === "string") {
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}
