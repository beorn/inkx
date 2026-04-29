/**
 * Shared `--limit` flag handling for CLI list commands.
 *
 * Used by `km bd list` and `km tasks list` to truncate result sets.
 * Treats 0, negative, and non-numeric values as "no limit".
 */

/**
 * Parse the raw value of a `--limit` flag into a non-negative integer.
 *
 * Returns 0 (meaning "no limit") for missing, non-numeric, zero, or
 * negative input — matching the existing `bd list` behavior so users can
 * pass `--limit 0` or omit the flag interchangeably.
 */
export function parseLimitFlag(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0
  const n = typeof value === "number" ? value : Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n)
}

/**
 * Apply `--limit N` to a list. Returns the (possibly truncated) slice plus
 * the message fragment for an "Items (X[ of Y])" header.
 *
 * The header reports "X of Y" only when truncation actually happened, so
 * `--limit 100` on a 5-item list looks identical to no limit.
 */
export function applyLimit<T>(items: T[], limit: number): { items: T[]; totalMsg: string } {
  const totalCount = items.length
  const limited = limit > 0 ? items.slice(0, limit) : items
  const truncated = limit > 0 && totalCount > limited.length
  return {
    items: limited,
    totalMsg: truncated ? `${limited.length} of ${totalCount}` : `${limited.length}`,
  }
}
