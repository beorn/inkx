/**
 * Date Query Resolution
 *
 * Resolves date shortcuts and ranges for query filtering.
 * Also provides natural language date resolution via chrono-node.
 */

import * as chrono from "chrono-node"

/**
 * Date range for query resolution
 */
export interface DateRange {
  start: string
  end: string
}

/**
 * Resolved date from natural language input
 */
export interface ResolvedDate {
  date: string // YYYY-MM-DD
  time?: string // HH:MM (only if user specified time)
}

/**
 * Format a date as YYYY-MM-DD in local timezone
 */
export function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Format a date's time as HH:MM. Returns "" for midnight (00:00).
 */
export function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 0 && m === 0) return ""
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Date shortcut names
 */
const DATE_SHORTCUTS = ["today", "tomorrow", "yesterday", "week", "past", "overdue"]

/**
 * Date fields in the schema
 */
const DATE_FIELDS = ["due_at", "start_at", "due_date", "scheduled_date", "created_at", "updated_at"]

/**
 * Check if a value is a date shortcut or date range
 */
export function isDateShortcut(value: string): boolean {
  // Check for date range pattern (YYYY-MM-DD-YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/.test(value)) {
    return true
  }
  return DATE_SHORTCUTS.includes(value.toLowerCase())
}

/**
 * Check if a field is a date field
 */
export function isDateField(field: string): boolean {
  return DATE_FIELDS.includes(field)
}

/**
 * Resolve a date shortcut to a date range (YYYY-MM-DD format)
 *
 * Supported shortcuts:
 * - today: today's date
 * - tomorrow: tomorrow's date
 * - yesterday: yesterday's date
 * - week: next 7 days (including today)
 * - past: all dates before today (overdue)
 * - YYYY-MM-DD: exact date
 * - YYYY-MM-DD-YYYY-MM-DD: date range
 */
export function resolveDateQuery(value: string): DateRange | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (value.toLowerCase()) {
    case "today": {
      const dateStr = formatDate(today)
      return { start: dateStr, end: dateStr }
    }

    case "tomorrow": {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = formatDate(tomorrow)
      return { start: dateStr, end: dateStr }
    }

    case "yesterday": {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = formatDate(yesterday)
      return { start: dateStr, end: dateStr }
    }

    case "week": {
      const weekEnd = new Date(today)
      weekEnd.setDate(weekEnd.getDate() + 6)
      return { start: formatDate(today), end: formatDate(weekEnd) }
    }

    case "past":
    case "overdue": {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: "0000-01-01", end: formatDate(yesterday) }
    }

    default: {
      // Check if it's a date range pattern (YYYY-MM-DD-YYYY-MM-DD)
      const rangeMatch = value.match(/^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/)
      if (rangeMatch?.[1] && rangeMatch[2]) {
        return { start: rangeMatch[1], end: rangeMatch[2] }
      }

      // Check if it's a single date pattern (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { start: value, end: value }
      }
      return null
    }
  }
}

/**
 * Resolve a natural language date string to a structured date (and optional time).
 *
 * Uses chrono-node for parsing. Handles inputs like:
 * - "today", "tomorrow", "friday", "next tuesday"
 * - "+3 days", "in 2 weeks"
 * - "jan 15", "jan 15 3pm"
 * - "2026-02-20", "2026-02-20T14:30"
 *
 * Returns null for empty/unparseable input.
 */
export function resolveRelativeDate(input: string, referenceDate?: Date): ResolvedDate | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Handle "+N days/weeks/months" shorthand — chrono doesn't parse this natively
  const plusMatch = trimmed.match(/^\+(\d+)\s*(days?|weeks?|months?|years?)$/i)
  if (plusMatch?.[1] && plusMatch[2]) {
    const ref = referenceDate ?? new Date()
    const n = parseInt(plusMatch[1], 10)
    const unit = plusMatch[2].toLowerCase()
    const result = new Date(ref)
    if (unit.startsWith("day")) result.setDate(result.getDate() + n)
    else if (unit.startsWith("week")) result.setDate(result.getDate() + n * 7)
    else if (unit.startsWith("month")) result.setMonth(result.getMonth() + n)
    else if (unit.startsWith("year")) result.setFullYear(result.getFullYear() + n)
    return { date: formatDate(result) }
  }

  // Handle ISO datetime with T separator (e.g., "2026-02-20T14:30")
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/)
  if (isoMatch?.[1] && isoMatch[2]) {
    return { date: isoMatch[1], time: isoMatch[2] }
  }

  const results = chrono.parse(trimmed, referenceDate ? { instant: referenceDate } : undefined)
  if (results.length === 0) return null

  const parsed = results[0]
  if (!parsed) return null
  const date = formatDate(parsed.start.date())

  // Only include time if the user explicitly specified it
  const hasTime = parsed.start.isCertain("hour")
  if (hasTime) {
    const hour = String(parsed.start.get("hour") ?? 0).padStart(2, "0")
    const minute = String(parsed.start.get("minute") ?? 0).padStart(2, "0")
    return { date, time: `${hour}:${minute}` }
  }

  return { date }
}
