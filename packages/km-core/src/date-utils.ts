/**
 * Date Composition/Decomposition Utilities
 *
 * Helpers for converting between the collapsed ISO 8601 date format
 * (due_at / start_at) and the legacy split format (date + time + tz).
 *
 * ISO 8601 formats supported:
 * - Date-only: "2026-02-20"
 * - Date + time: "2026-02-20T14:00"
 * - Date + time + offset: "2026-02-20T14:00:00-08:00"
 */

/**
 * Decomposed date fields (legacy format).
 */
export interface DateParts {
  date: string // YYYY-MM-DD
  time?: string // HH:MM
  tz?: string // IANA timezone (not used in decompose, only in compose)
}

/**
 * Compose an ISO 8601 string from separate date/time/tz parts.
 * Returns undefined if no date is provided.
 *
 * @example composeDatetime("2026-02-20") // "2026-02-20"
 * @example composeDatetime("2026-02-20", "14:00") // "2026-02-20T14:00"
 * @example composeDatetime("2026-02-20", "14:00", "America/Los_Angeles") // "2026-02-20T14:00"
 */
export function composeDatetime(date?: string | null, time?: string | null, _tz?: string | null): string | undefined {
  if (!date) return undefined
  if (!time) return date
  return `${date}T${time}`
}

/**
 * Decompose an ISO 8601 string into separate date/time parts.
 * Returns undefined if input is undefined/null.
 *
 * @example decomposeDatetime("2026-02-20") // { date: "2026-02-20" }
 * @example decomposeDatetime("2026-02-20T14:00") // { date: "2026-02-20", time: "14:00" }
 * @example decomposeDatetime("2026-02-20T14:00:00-08:00") // { date: "2026-02-20", time: "14:00" }
 */
export function decomposeDatetime(isoStr?: string | null): DateParts | undefined {
  if (!isoStr) return undefined

  // Date-only: "2026-02-20"
  if (isoStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return { date: isoStr }
  }

  // Has T separator: "2026-02-20T14:00" or "2026-02-20T14:00:00-08:00"
  const tIdx = isoStr.indexOf("T")
  if (tIdx === 10) {
    const date = isoStr.slice(0, 10)
    const rest = isoStr.slice(11)
    // Extract HH:MM (first 5 chars of time portion)
    const time = rest.slice(0, 5)
    return { date, time }
  }

  // Fallback: treat as date-only
  return { date: isoStr.slice(0, 10) }
}

/**
 * Decompose a node's due_at and start_at into DateParts.
 * Centralises the common pattern of calling decomposeDatetime twice.
 */
export function extractTaskDates(node: { due_at?: string; start_at?: string }): {
  due: DateParts | undefined
  start: DateParts | undefined
} {
  return {
    due: decomposeDatetime(node.due_at),
    start: decomposeDatetime(node.start_at),
  }
}

/**
 * Extract just the date portion (YYYY-MM-DD) from a due_at/start_at value.
 * Convenience wrapper over decomposeDatetime.
 */
export function dateOnly(isoStr?: string | null): string | undefined {
  return decomposeDatetime(isoStr)?.date
}

/**
 * Extract just the time portion (HH:MM) from a due_at/start_at value.
 * Returns undefined if no time component.
 */
export function timeOnly(isoStr?: string | null): string | undefined {
  return decomposeDatetime(isoStr)?.time
}
