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

/**
 * Convert natural language recurrence to RRULE
 * Handles Obsidian Tasks format: "every day", "every week", "every 2 weeks", etc.
 */
export function naturalToRRule(natural: string): string | null {
  const lower = natural.toLowerCase().trim()

  // Already RRULE format
  if (lower.startsWith("freq=")) {
    return natural.toUpperCase()
  }

  // "every day" / "daily"
  if (lower === "daily" || lower === "every day") {
    return "FREQ=DAILY"
  }

  // "every N days"
  const daysMatch = lower.match(/every (\d+) days?/)
  if (daysMatch) {
    return `FREQ=DAILY;INTERVAL=${daysMatch[1]}`
  }

  // "every week" / "weekly"
  if (lower === "weekly" || lower === "every week") {
    return "FREQ=WEEKLY"
  }

  // "every N weeks"
  const weeksMatch = lower.match(/every (\d+) weeks?/)
  if (weeksMatch) {
    return `FREQ=WEEKLY;INTERVAL=${weeksMatch[1]}`
  }

  // "every weekday" / "weekdays"
  if (lower === "weekdays" || lower === "every weekday") {
    return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  }

  // "every monday" or "every mon" (must be full match to avoid matching "month")
  const dayMatch = lower.match(
    /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/,
  )
  if (dayMatch) {
    const dayName = dayMatch[1] as string
    const dayMap: Record<string, string> = {
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
    const dayCode = dayMap[dayName] ?? "MO"
    return `FREQ=WEEKLY;BYDAY=${dayCode}`
  }

  // "every month" / "monthly"
  if (lower === "monthly" || lower === "every month") {
    return "FREQ=MONTHLY"
  }

  // "every N months"
  const monthsMatch = lower.match(/every (\d+) months?/)
  if (monthsMatch) {
    return `FREQ=MONTHLY;INTERVAL=${monthsMatch[1]}`
  }

  // "every year" / "yearly" / "annually"
  if (lower === "yearly" || lower === "annually" || lower === "every year") {
    return "FREQ=YEARLY"
  }

  return null
}
