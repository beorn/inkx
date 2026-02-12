/**
 * Recurrence Utilities
 *
 * Simple RRULE-based recurrence calculation for tasks.
 * Supports a subset of iCal RRULE format.
 */

/**
 * Parse RRULE string into components
 * Example: "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2"
 */
export function parseRRule(rrule: string): {
  freq: string
  interval: number
  byDay?: string[]
  byMonthDay?: number[]
} {
  const parts = rrule.split(";")
  const result: {
    freq: string
    interval: number
    byDay?: string[]
    byMonthDay?: number[]
  } = {
    freq: "DAILY",
    interval: 1,
  }

  for (const part of parts) {
    const [key, value] = part.split("=")
    if (!key || !value) continue

    switch (key.toUpperCase()) {
      case "FREQ":
        result.freq = value.toUpperCase()
        break
      case "INTERVAL":
        result.interval = parseInt(value, 10) || 1
        break
      case "BYDAY":
        result.byDay = value.split(",")
        break
      case "BYMONTHDAY":
        result.byMonthDay = value.split(",").map((d) => parseInt(d, 10))
        break
    }
  }

  return result
}

/**
 * Day name to day number mapping (0 = Sunday)
 */
const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

/**
 * Calculate next occurrence date from an RRULE
 */
// oxlint-disable-next-line complexity/complexity -- RRULE state machine: DAILY/WEEKLY/MONTHLY/YEARLY with interval and count
export function getNextOccurrence(rrule: string, fromDate: string): string | null {
  const parsed = parseRRule(rrule)
  const from = new Date(fromDate + "T12:00:00Z") // Use noon to avoid timezone issues

  if (isNaN(from.getTime())) return null

  const next = new Date(from)

  switch (parsed.freq) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + parsed.interval)
      break

    case "WEEKLY":
      if (parsed.byDay && parsed.byDay.length > 0) {
        // Find next occurrence on one of the specified days
        const currentDay = next.getUTCDay()
        const targetDays = parsed.byDay
          .map((d) => DAY_MAP[d.toUpperCase()])
          .filter((d) => d !== undefined)
          .sort((a, b) => a - b)

        if (targetDays.length === 0) {
          // No valid days, just add interval weeks
          next.setUTCDate(next.getUTCDate() + 7 * parsed.interval)
        } else {
          // Find next target day
          let daysToAdd = 0
          let foundInCurrentWeek = false

          for (const targetDay of targetDays) {
            if (targetDay > currentDay) {
              daysToAdd = targetDay - currentDay
              foundInCurrentWeek = true
              break
            }
          }

          if (!foundInCurrentWeek) {
            // Go to first target day of next interval week
            const firstTarget = targetDays[0] ?? 0
            daysToAdd = 7 * parsed.interval - currentDay + firstTarget
          }

          next.setUTCDate(next.getUTCDate() + daysToAdd)
        }
      } else {
        // Simple weekly: same day next week(s)
        next.setUTCDate(next.getUTCDate() + 7 * parsed.interval)
      }
      break

    case "MONTHLY":
      if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
        // Find next occurrence on one of the specified days
        const currentMonthDay = next.getUTCDate()
        const targetDays = parsed.byMonthDay.sort((a, b) => a - b)

        let found = false
        for (const targetDay of targetDays) {
          if (targetDay > currentMonthDay) {
            next.setUTCDate(targetDay)
            found = true
            break
          }
        }

        if (!found) {
          // Go to first target day of next month
          next.setUTCMonth(next.getUTCMonth() + parsed.interval)
          next.setUTCDate(targetDays[0] ?? 1)
        }
      } else {
        // Simple monthly: same day next month(s)
        next.setUTCMonth(next.getUTCMonth() + parsed.interval)
      }
      break

    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + parsed.interval)
      break

    default:
      return null
  }

  return next.toISOString().slice(0, 10)
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
