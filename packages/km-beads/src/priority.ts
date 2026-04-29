/**
 * Priority normalization.
 *
 * Accepts any of: "0".."4", "P0".."P4", "p0".."p4". Returns canonical
 * "P${digit}" or null when the input doesn't match. Shared by:
 *   - bd create (mutations) — canonicalizes the on-disk tag
 *   - bd list / bd ready (queries) — canonicalizes the filter input
 *   - tasks list — canonicalizes the filter input
 *
 * Without this, `--priority 0` and `--priority P0` could write/match
 * different tag forms (`#0` vs `#P0`) and miss each other's beads.
 */
export function normalizePriority(input: string | undefined | null): string | null {
  if (input === undefined || input === null || input === "") return null
  const m = String(input).match(/^P?([0-4])$/i)
  return m?.[1] ? `P${m[1]}` : null
}
