/**
 * Recurrence Utilities
 *
 * RRULE-based recurrence calculation for tasks.
 * Uses the `rrule` library for reliable iCal RRULE parsing and occurrence calculation.
 */

import { RRule } from "rrule"

/**
 * Parse an RRULE string that may contain a FROM parameter.
 * Returns the base RRULE (without FROM) and the from mode.
 *
 * FROM=COMPLETED (default) — next due calculated from completed_at
 * FROM=DUE                 — next due calculated from due_at
 */
export function parseRRule(rrule: string): { rule: string; from: "completed" | "due" } {
  const fromMatch = rrule.match(/;?FROM=(COMPLETED|DUE)/i)
  const from = fromMatch?.[1]?.toUpperCase() === "DUE" ? "due" : "completed"
  const rule = rrule.replace(/;?FROM=(COMPLETED|DUE)/i, "")
  return { rule, from }
}

/**
 * Calculate next occurrence date from an RRULE string.
 * Returns the next date after `fromDate` as YYYY-MM-DD, or null if invalid/no next occurrence.
 * Strips any FROM parameter before passing to the rrule library.
 */
export function getNextOccurrence(rrule: string, fromDate: string): string | null {
  const from = new Date(fromDate + "T12:00:00Z")
  if (isNaN(from.getTime())) return null

  const { rule } = parseRRule(rrule)

  try {
    // Parse RRULE options and set dtstart to fromDate so recurrence starts from there
    const ruleObj = RRule.fromString(`DTSTART:${fromDate.replace(/-/g, "")}T120000Z\nRRULE:${rule}`)
    // Get first occurrence strictly after fromDate
    const next = ruleObj.after(from, false)
    if (!next) return null
    return next.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

/** Lookup tables for natural language → RRULE conversion */
const PERIOD_ALIASES: Record<string, string> = {
  daily: "FREQ=DAILY",
  "every day": "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  "every week": "FREQ=WEEKLY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "every weekday": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  monthly: "FREQ=MONTHLY",
  "every month": "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
  annually: "FREQ=YEARLY",
  "every year": "FREQ=YEARLY",
}

const INTERVAL_PATTERNS: [RegExp, string][] = [
  [/every (\d+) days?/, "DAILY"],
  [/every (\d+) weeks?/, "WEEKLY"],
  [/every (\d+) months?/, "MONTHLY"],
]

const DAY_CODES: Record<string, string> = {
  monday: "MO",
  mon: "MO",
  tuesday: "TU",
  tue: "TU",
  wednesday: "WE",
  wed: "WE",
  thursday: "TH",
  thu: "TH",
  friday: "FR",
  fri: "FR",
  saturday: "SA",
  sat: "SA",
  sunday: "SU",
  sun: "SU",
}

/**
 * Convert natural language recurrence to RRULE
 * Handles Obsidian Tasks format: "every day", "every week", "every 2 weeks", etc.
 * Supports optional " on schedule" / " on due" suffix → appends ;FROM=DUE when present.
 */
export function naturalToRRule(natural: string): string | null {
  let lower = natural.toLowerCase().trim()

  // Strip and detect FROM suffix: "on schedule" or "on due"
  const fromSuffixMatch = lower.match(/ on (schedule|due)$/)
  const hasDueSuffix = fromSuffixMatch !== null
  if (fromSuffixMatch) {
    lower = lower.slice(0, lower.length - fromSuffixMatch[0].length).trim()
  }

  const appendFrom = (rule: string) => (hasDueSuffix ? `${rule};FROM=DUE` : rule)

  if (lower.startsWith("freq=")) return appendFrom(natural.toUpperCase().replace(/ ON (SCHEDULE|DUE)$/i, "").trim())

  const alias = PERIOD_ALIASES[lower]
  if (alias) return appendFrom(alias)

  for (const [pattern, freq] of INTERVAL_PATTERNS) {
    const match = lower.match(pattern)
    if (match) return appendFrom(`FREQ=${freq};INTERVAL=${match[1]}`)
  }

  const dayMatch = lower.match(
    /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/,
  )
  if (dayMatch?.[1]) return appendFrom(`FREQ=WEEKLY;BYDAY=${DAY_CODES[dayMatch[1]] ?? "MO"}`)

  return null
}
