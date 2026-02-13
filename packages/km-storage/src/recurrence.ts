/**
 * Recurrence Utilities
 *
 * RRULE-based recurrence calculation for tasks.
 * Uses the `rrule` library for reliable iCal RRULE parsing and occurrence calculation.
 */

import { RRule } from "rrule"

/**
 * Calculate next occurrence date from an RRULE string.
 * Returns the next date after `fromDate` as YYYY-MM-DD, or null if invalid/no next occurrence.
 */
export function getNextOccurrence(rrule: string, fromDate: string): string | null {
  const from = new Date(fromDate + "T12:00:00Z")
  if (isNaN(from.getTime())) return null

  try {
    // Parse RRULE options and set dtstart to fromDate so recurrence starts from there
    const rule = RRule.fromString(`DTSTART:${fromDate.replace(/-/g, "")}T120000Z\nRRULE:${rrule}`)
    // Get first occurrence strictly after fromDate
    const next = rule.after(from, false)
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
  monday: "MO", mon: "MO", tuesday: "TU", tue: "TU",
  wednesday: "WE", wed: "WE", thursday: "TH", thu: "TH",
  friday: "FR", fri: "FR", saturday: "SA", sat: "SA",
  sunday: "SU", sun: "SU",
}

/**
 * Convert natural language recurrence to RRULE
 * Handles Obsidian Tasks format: "every day", "every week", "every 2 weeks", etc.
 */
export function naturalToRRule(natural: string): string | null {
  const lower = natural.toLowerCase().trim()

  if (lower.startsWith("freq=")) return natural.toUpperCase()

  const alias = PERIOD_ALIASES[lower]
  if (alias) return alias

  for (const [pattern, freq] of INTERVAL_PATTERNS) {
    const match = lower.match(pattern)
    if (match) return `FREQ=${freq};INTERVAL=${match[1]}`
  }

  const dayMatch = lower.match(
    /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/,
  )
  if (dayMatch?.[1]) return `FREQ=WEEKLY;BYDAY=${DAY_CODES[dayMatch[1]] ?? "MO"}`

  return null
}
