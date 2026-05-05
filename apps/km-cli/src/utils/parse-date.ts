/**
 * Natural-language date parser for CLI input.
 *
 * Wraps `resolveRelativeDate` from `@km/core` (which uses chrono-node) and
 * adds the CLI-specific shortcuts the user actually types in `tasks set`,
 * `--due`, `--start`, etc.:
 *
 *   - `tmrw`, `tom`        → tomorrow
 *   - `+2w`, `+3d`, `+1m`  → compact relative (chrono needs `2 weeks`)
 *   - `eod`, `eow`         → end of day / end of week (Sunday)
 *   - `eom`, `eoq`         → end of month / end of quarter
 *
 * Returns a `{ iso, humanized }` pair on success, `{ error }` on failure.
 * Single source of truth — both the CLI display ("due: 2026-05-06 (tomorrow)")
 * and the storage write ("2026-05-06") flow through this normalization.
 */

import { resolveRelativeDate, formatDate } from "@km/core"

export interface ParsedDate {
  /** YYYY-MM-DD (date) or YYYY-MM-DDTHH:MM (with time) — what gets persisted. */
  iso: string
  /** Human label echoed to the user, e.g. "tomorrow", "next monday", "in 2 weeks". */
  humanized: string
}

export interface ParseDateError {
  error: string
}

export type ParseDateResult = ParsedDate | ParseDateError

/** Compact relative shortcut: `+Nd`, `+Nw`, `+Nm`, `+Ny`. */
const COMPACT_REL = /^\+(\d+)([dwmy])$/i

/** "Tomorrow" / "today" abbreviations not handled by chrono natively. */
const TMRW = new Set(["tmrw", "tom"])
const TODAY_ABBRS = new Set(["tdy"])

/**
 * Parse a natural-language date string.
 *
 * Resolution order:
 *   1. Empty string → error.
 *   2. `eod`/`eow`/`eom`/`eoq` shortcuts (case-insensitive).
 *   3. Compact `+Nd|w|m|y` shortcut.
 *   4. CLI-only abbreviations (tmrw, tdy).
 *   5. Pass-through to `resolveRelativeDate` (chrono-node + ISO + `+N units`).
 *
 * Returns the same `iso` value the user could have typed by hand —
 * downstream code never has to re-parse.
 */
export function parseDate(input: string, now?: Date): ParseDateResult {
  const trimmed = input.trim()
  if (!trimmed) return { error: "empty date" }

  const lower = trimmed.toLowerCase()
  const ref = now ?? new Date()

  // End-of-X shortcuts. All return start of LOCAL day (00:00 implied).
  switch (lower) {
    case "eod":
      return { iso: formatDate(ref), humanized: "end of day (today)" }
    case "eow": {
      // End of week = Sunday (ISO weekend convention used in km).
      const d = new Date(ref)
      const dow = d.getDay() // 0=Sun..6=Sat
      const daysToSun = (7 - dow) % 7
      d.setDate(d.getDate() + daysToSun)
      return { iso: formatDate(d), humanized: "end of week (sunday)" }
    }
    case "eom": {
      const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
      return { iso: formatDate(d), humanized: "end of month" }
    }
    case "eoq": {
      // Quarter ends: Mar 31 / Jun 30 / Sep 30 / Dec 31.
      const m = ref.getMonth()
      const qEndMonth = m - (m % 3) + 2 // 0,1,2 → 2; 3,4,5 → 5; ...
      const d = new Date(ref.getFullYear(), qEndMonth + 1, 0)
      return { iso: formatDate(d), humanized: "end of quarter" }
    }
  }

  // Compact relative form: +2w, +3d, +1m, +1y.
  const compact = trimmed.match(COMPACT_REL)
  if (compact?.[1] && compact[2]) {
    const n = parseInt(compact[1], 10)
    const unit = compact[2].toLowerCase()
    const result = new Date(ref)
    let humanUnit = ""
    switch (unit) {
      case "d":
        result.setDate(result.getDate() + n)
        humanUnit = n === 1 ? "day" : "days"
        break
      case "w":
        result.setDate(result.getDate() + n * 7)
        humanUnit = n === 1 ? "week" : "weeks"
        break
      case "m":
        result.setMonth(result.getMonth() + n)
        humanUnit = n === 1 ? "month" : "months"
        break
      case "y":
        result.setFullYear(result.getFullYear() + n)
        humanUnit = n === 1 ? "year" : "years"
        break
    }
    return { iso: formatDate(result), humanized: `in ${n} ${humanUnit}` }
  }

  // Tomorrow abbreviations.
  if (TMRW.has(lower)) {
    const d = new Date(ref)
    d.setDate(d.getDate() + 1)
    return { iso: formatDate(d), humanized: "tomorrow" }
  }
  if (TODAY_ABBRS.has(lower)) {
    return { iso: formatDate(ref), humanized: "today" }
  }

  // Delegate to the existing chrono-node wrapper for everything else
  // (today, tomorrow, friday, next monday, jan 15, +N days, ISO).
  const resolved = resolveRelativeDate(trimmed, ref)
  if (!resolved) return { error: `cannot parse date: ${input}` }

  const iso = resolved.time ? `${resolved.date}T${resolved.time}` : resolved.date
  // Heuristic humanization: pass the input back as the label when chrono
  // accepted it verbatim (ISO date), otherwise echo the lower-cased form
  // — that's what the user typed, no need to re-translate.
  const humanized = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed : lower
  return { iso, humanized }
}
