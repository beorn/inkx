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
export function getNextOccurrence(
  rrule: string,
  fromDate: string,
): string | null {
  const parsed = parseRRule(rrule)
  const from = new Date(fromDate + "T12:00:00Z") // Use noon to avoid timezone issues

  if (isNaN(from.getTime())) return null

  const next = new Date(from)

  const handlers: Record<string, () => void> = {
    DAILY: () => advanceDaily(next, parsed.interval),
    WEEKLY: () => advanceWeekly(next, parsed.interval, parsed.byDay),
    MONTHLY: () => advanceMonthly(next, parsed.interval, parsed.byMonthDay),
    YEARLY: () => advanceYearly(next, parsed.interval),
  }

  const handler = handlers[parsed.freq]
  if (!handler) return null

  handler()
  return next.toISOString().slice(0, 10)
}

function advanceDaily(date: Date, interval: number): void {
  date.setUTCDate(date.getUTCDate() + interval)
}

function advanceWeekly(
  date: Date,
  interval: number,
  byDay: string[] | undefined,
): void {
  if (!byDay || byDay.length === 0) {
    date.setUTCDate(date.getUTCDate() + 7 * interval)
    return
  }

  const targetDays = parseTargetDays(byDay)
  if (targetDays.length === 0) {
    date.setUTCDate(date.getUTCDate() + 7 * interval)
    return
  }

  const daysToAdd = calculateWeeklyDaysToAdd(
    date.getUTCDay(),
    targetDays,
    interval,
  )
  date.setUTCDate(date.getUTCDate() + daysToAdd)
}

function parseTargetDays(byDay: string[]): number[] {
  return byDay
    .map((d) => DAY_MAP[d.toUpperCase()])
    .filter((d) => d !== undefined)
    .sort((a, b) => a - b)
}

function calculateWeeklyDaysToAdd(
  currentDay: number,
  targetDays: number[],
  interval: number,
): number {
  for (const targetDay of targetDays) {
    if (targetDay > currentDay) {
      return targetDay - currentDay
    }
  }
  // Go to first target day of next interval week
  const firstTarget = targetDays[0] ?? 0
  return 7 * interval - currentDay + firstTarget
}

function advanceMonthly(
  date: Date,
  interval: number,
  byMonthDay: number[] | undefined,
): void {
  if (!byMonthDay || byMonthDay.length === 0) {
    date.setUTCMonth(date.getUTCMonth() + interval)
    return
  }

  const currentMonthDay = date.getUTCDate()
  const targetDays = byMonthDay.toSorted((a, b) => a - b)

  for (const targetDay of targetDays) {
    if (targetDay > currentMonthDay) {
      date.setUTCDate(targetDay)
      return
    }
  }

  // Go to first target day of next month
  date.setUTCMonth(date.getUTCMonth() + interval)
  date.setUTCDate(targetDays[0] ?? 1)
}

function advanceYearly(date: Date, interval: number): void {
  date.setUTCFullYear(date.getUTCFullYear() + interval)
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
