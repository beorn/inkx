/**
 * Display formatters for `km task set` / `km task clear` output.
 *
 * The action handler in `set-clear.ts` is mostly I/O glue — pulling these
 * format helpers into a separate module keeps them unit-testable without
 * spinning up commander or `createTerm`. Mirrors the planner-vs-action
 * split already used by `set-clear-plan.ts`.
 *
 * Target output (set):
 *   ✓ Updated due:
 *     due: 2026-05-06 (tomorrow)
 *     foo
 *
 * Target output (clear):
 *   ○ Cleared due:
 *     foo
 */

import type { SetFieldPlan } from "./set-clear-plan.ts"

/**
 * Storage column → user-facing display key.
 *
 * Keeps the action handler honest: the planner emits `due_at` (the
 * SQLite column), but the CLI surface advertises `due` (what the user
 * typed). Falls back to the raw column name for anything not in the
 * map — safer than silently dropping a key the user touched.
 */
const COLUMN_DISPLAY_KEY: Record<string, string> = {
  due_at: "due",
  start_at: "start",
  priority: "priority",
  assigned_to: "owner",
}

function displayKey(column: string): string {
  return COLUMN_DISPLAY_KEY[column] ?? column
}

/**
 * Per-column detail lines for `set` output.
 *
 * `data` and `item` are treated as compound updates — the planner stuffs
 * tags/aliases under `data` and status under `item`. We expand them into
 * their own display keys so users see what changed, not the storage
 * internal name. Date fields render `<key>: <iso> (<humanized>)`; other
 * fields render `<key>: <value>`.
 */
function formatUpdateLines(updates: Record<string, unknown>, humanized: Record<string, string>): string[] {
  const lines: string[] = []

  for (const [column, value] of Object.entries(updates)) {
    if (column === "item") {
      const item = value as { task?: { status?: string } } | undefined
      const status = item?.task?.status
      if (status !== undefined) lines.push(`status: ${status}`)
      continue
    }
    if (column === "data") {
      const data = value as Record<string, unknown>
      if (Array.isArray(data.tags)) {
        const tags = (data.tags as string[]).filter((t) => typeof t === "string")
        lines.push(`tags: ${tags.length > 0 ? tags.join(", ") : "(empty)"}`)
      }
      if (Array.isArray(data.aliases)) {
        const aliases = (data.aliases as string[]).filter((a) => typeof a === "string")
        lines.push(`aliases: ${aliases.length > 0 ? aliases.join(", ") : "(empty)"}`)
      }
      continue
    }

    const key = displayKey(column)
    if (value === null) {
      lines.push(`${key}: (cleared)`)
      continue
    }
    const human = humanized[column]
    if (human !== undefined && human !== String(value)) {
      lines.push(`${key}: ${String(value)} (${human})`)
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }

  return lines
}

/**
 * Header keys for the `Updated <keys>:` line.
 *
 * Same `column → display key` mapping as the detail lines, but compound
 * columns expand into the user-facing keys they affect (so `data: {tags,
 * aliases}` shows `tags, aliases` in the header, not `data`).
 */
function headerKeys(plan: SetFieldPlan): string[] {
  const keys: string[] = []
  for (const [column, value] of Object.entries(plan.updates)) {
    if (column === "item") {
      const item = value as { task?: { status?: string } } | undefined
      if (item?.task?.status !== undefined) keys.push("status")
      continue
    }
    if (column === "data") {
      const data = value as Record<string, unknown>
      if (Array.isArray(data.tags)) keys.push("tags")
      if (Array.isArray(data.aliases)) keys.push("aliases")
      continue
    }
    keys.push(displayKey(column))
  }
  if (plan.newParentId) keys.push("parent")
  return keys
}

export interface FormattedSet {
  /** First line, e.g. `Updated due:`. */
  header: string
  /** Indented detail lines, in input order. */
  details: string[]
}

/**
 * Format a `SetFieldPlan` for terminal output.
 *
 * Returns the header + detail lines so the caller can colorize the
 * checkmark and apply `term.dim` / `term.green` consistently. The
 * trailing id line is the caller's responsibility (it knows whether the
 * user typed an id vs name vs prefix).
 */
export function formatSetUpdates(plan: SetFieldPlan): FormattedSet {
  const keys = headerKeys(plan)
  const details = formatUpdateLines(plan.updates, plan.humanized)
  if (plan.newParentId) details.push(`parent: ${plan.newParentId}`)
  return { header: `Updated ${keys.join(", ")}:`, details }
}

/**
 * Format clear-output keys: maps each user-typed field to its display
 * label (so `clear due` → `Cleared due:`, not `Cleared due_at:`).
 */
export function formatClearKeys(fields: readonly string[]): string {
  const seen: string[] = []
  for (const field of fields) {
    const lower = field.toLowerCase()
    // Run through the same column mapping by piggy-backing on the
    // column-aliasing the planner already does. We re-map here rather
    // than threading the planner's resolved column out so the function
    // stays pure (no Repo / planner dependency).
    const column = CLEAR_FIELD_TO_COLUMN[lower]
    seen.push(column ? displayKey(column) : lower)
  }
  return seen.join(", ")
}

/**
 * Mirror of `SCALAR_FIELD_COLUMNS` in `set-clear-plan.ts`, kept narrow
 * because `formatClearKeys` only needs to resolve user-typed aliases to
 * a column name for display. The planner remains the source of truth
 * for which aliases are accepted; this map exists only so we can pretty-
 * print the user's input without forcing the action handler to thread
 * the planner's internal field map out through `ClearFieldPlan`.
 */
const CLEAR_FIELD_TO_COLUMN: Record<string, string> = {
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
