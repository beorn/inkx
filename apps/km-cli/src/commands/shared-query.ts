/**
 * Shared Query Interface
 *
 * Common CLI flags and query building for km list and km bd list.
 * Both commands share the same DSL, differing only in defaults.
 */

import type { Command } from "@silvery/commander"

/** Common CLI flags that both km list and km bd list accept */
export interface SharedQueryFlags {
  status?: string
  type?: string
  assignee?: string
  priority?: string
  blocked?: boolean
  unblocked?: boolean
  all?: boolean
  json?: boolean
}

/** Defaults that differ per command */
export interface QueryDefaults {
  /** Default board tag filter, e.g., "issue" for km bd */
  boardTag?: string
  /** Default status filter, e.g., "todo" for km bd ready */
  statusFilter?: string
  /** Whether to exclude done by default (true for km list) */
  excludeDone?: boolean
}

/**
 * Build a query string from CLI flags + defaults.
 *
 * The resulting string is passed to repo.query() or repo.queryTasks().
 */
export function buildQueryString(
  positionalQuery: string | undefined,
  flags: SharedQueryFlags,
  defaults: QueryDefaults,
): string {
  const parts: string[] = []

  // Add board tag unless --all
  if (!flags.all && defaults.boardTag) {
    parts.push(`@${defaults.boardTag}`)
  }

  // Positional query takes precedence for status/text
  if (positionalQuery) {
    parts.push(positionalQuery)
  }

  // Add flag-based filters
  if (flags.status) {
    parts.push(`status:${flags.status}`)
  } else if (defaults.statusFilter) {
    parts.push(`status:${defaults.statusFilter}`)
  } else if (defaults.excludeDone && !positionalQuery?.includes("status:")) {
    parts.push(`-status:done`)
  }

  if (flags.type) parts.push(`#${flags.type}`)
  if (flags.assignee) parts.push(`@${flags.assignee}`)
  if (flags.priority !== undefined) {
    const p = /^\d$/.test(flags.priority) ? `P${flags.priority}` : flags.priority
    parts.push(`#${p}`)
  }

  return parts.join(" ").trim() || "*"
}

/**
 * Add shared query options to a Commander command.
 *
 * Returns the command for chaining.
 */
export function addSharedQueryOptions<T extends Command<any>>(cmd: T) {
  return cmd
    .option("-s, --status <status>", "Filter by status (todo,wip,blocked,done,dropped)")
    .option("-t, --type <type>", "Filter by type")
    .option("-a, --assignee <name>", "Filter by assignee")
    .option("-p, --priority <value>", "Filter by priority (e.g. P0-P4 or 0-4)")
    .option("--blocked", "Show only blocked")
    .option("--unblocked", "Show only unblocked")
    .option("--all", "Show all (ignore default filters)")
    .option("--json", "Output as JSON")
}
