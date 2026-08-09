/**
 * Integer width apportionment — the one shared allocator for every surface
 * that splits an integer span across parallel tracks (table columns, board
 * columns, pane lanes).
 *
 * Model: each track has a `[min, max]` band. One scalar tension `t` in [0, 1]
 * slides every track across its own band together:
 *
 *     w_i = min_i + t * (max_i - min_i)
 *
 * with `t` chosen so the real-valued widths sum to the available width
 * (clamped at the band ends). This is the css-tables-3 automatic-layout
 * distribution specialized to the all-auto column case, where the sizing
 * guesses collapse to a single interpolation parameter. Shrink is therefore
 * proportional to shrinkability (`max - min`): a rigid track (`min === max`)
 * never yields, for free.
 *
 * Integer widths come from Webster/Sainte-Laguë incremental apportionment,
 * which is house-monotone by construction: growing the span by one cell gives
 * exactly one track one more cell, so no track ever SHRINKS as the span
 * WIDENS. Cumulative/largest-remainder rounding was measured to violate that
 * (the Alabama paradox — Balinski–Young: only divisor methods are
 * house-monotone) and is deliberately not offered.
 *
 * Infeasibility (`width < Σmin`) is REPORTED, not papered over: the caller
 * gets `feasible: false` with min-content widths and must escalate — change
 * presentation, degrade wrapping — rather than render an allocation that
 * violates its own floors while looking fine.
 */

export type ApportionTrack = {
  /** Smallest acceptable integer width (min-content for text tracks). */
  min: number
  /** Largest useful integer width (max-content for text tracks). */
  max: number
}

export type ApportionResult = {
  /** Integer width per track, same order as the input. */
  widths: number[]
  /** The band tension actually used, in [0, 1]. */
  t: number
  /** False when `width < Σmin` — the caller must escalate, not render as-is. */
  feasible: boolean
}

export type ApportionOptions = {
  /**
   * false (default): widths cap at `max` and the sum may fall short of the
   * available width (natural-width tables). true: excess beyond `Σmax` is
   * distributed proportionally to `max`.
   */
  stretch?: boolean
}

/**
 * Marker carrying a track's band to the renderer, as `"min,max"`.
 *
 * `apportion()` establishes a band contract; the widths it returns then become
 * layout props and the layout engine has the final say. The band has to travel
 * with the node for anything downstream to tell a correct allocation from one
 * the engine overrode. Stamping this marker opts a surface into the
 * `apportion-bands` runtime check (see `strictApportionBandsCheck`).
 *
 * Band values are the track's TOTAL width including cell chrome — the same
 * quantity the allocator apportions and the layout engine realizes. A band
 * expressed in content-only units would compare against the wrong number.
 */
export const TRACK_BAND_ATTR = "data-track-band"

/**
 * Parse a `data-track-band` marker value.
 *
 * Absent ⇒ null (the node simply isn't a track). Present but unparseable ⇒
 * throws: a marker that silently fails to parse turns the whole check into a
 * guard that is wired, documented, and empty.
 */
export function parseTrackBand(value: unknown): ApportionTrack | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string")
    throw new Error(`${TRACK_BAND_ATTR}: expected a "min,max" string (got ${typeof value})`)
  const parts = value.split(",")
  if (parts.length !== 2) throw new Error(`${TRACK_BAND_ATTR}: expected "min,max" (got "${value}")`)
  const min = Number(parts[0])
  const max = Number(parts[1])
  if (!Number.isInteger(min) || !Number.isInteger(max))
    throw new Error(`${TRACK_BAND_ATTR}: min/max must be integers (got "${value}")`)
  if (!(min >= 0 && min <= max))
    throw new Error(`${TRACK_BAND_ATTR}: requires 0 <= min <= max (got "${value}")`)
  return { min, max }
}

/** A realized track: the band it was allocated under and the width it actually got. */
export type RealizedTrack = ApportionTrack & { width: number }

export type ApportionBandViolation = {
  /** Index of the track rendered below its band floor. */
  starved: number
  /** Index of the sibling rendered above its band ceiling. */
  donor: number
}

/**
 * The apportionment invariant over REALIZED widths: no track below its minimum
 * while a sibling exceeds its maximum. Returns the first such pair, or null.
 *
 * The conjunction is the whole point, and neither half is a defect alone:
 *
 * - Below-min alone is legible degradation. When the floors genuinely do not
 *   fit, a surface is supposed to lower them visibly (character wrapping,
 *   truncation with an ellipsis) rather than pretend. `apportion()` reports
 *   `feasible: false` precisely so the caller can do that on purpose.
 * - Above-max alone is a `grow` track absorbing free space nobody else wants.
 *
 * Together they mean width was taken from a track that needed it and handed to
 * one that could not use it — the measured defect class behind this allocator's
 * consolidation, and the shape no amount of screenshotting catches because it
 * only appears at particular widths.
 *
 * Pure and target-agnostic: cells today, px on canvas/DOM later. The strictness
 * gate and the per-frame walk live with the renderer, not here.
 */
export function findApportionBandViolation(
  tracks: readonly RealizedTrack[],
): ApportionBandViolation | null {
  let starved = -1
  let donor = -1
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!
    if (starved < 0 && t.width < t.min) starved = i
    if (donor < 0 && t.width > t.max) donor = i
  }
  if (starved < 0 || donor < 0 || starved === donor) return null
  return { starved, donor }
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** Integer cell grid only: fractional bands are a programming error, not a rounding job. */
function validate(tracks: readonly ApportionTrack[], width: number): void {
  if (!Number.isInteger(width))
    throw new Error(`apportion: width must be an integer (got ${width})`)
  for (let i = 0; i < tracks.length; i++) {
    const { min, max } = tracks[i]!
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`apportion: track ${i} min/max must be integers (got min=${min}, max=${max})`)
    }
    if (!(min >= 0 && min <= max)) {
      throw new Error(`apportion: track ${i} requires 0 <= min <= max (got min=${min}, max=${max})`)
    }
  }
}

/** The band tension: clamp((width - Σmin) / (Σmax - Σmin), 0, 1); degenerate Σmax == Σmin ⇒ 1. */
export function apportionTension(tracks: readonly ApportionTrack[], width: number): number {
  validate(tracks, width)
  const lo = sum(tracks.map((c) => c.min))
  const hi = sum(tracks.map((c) => c.max))
  if (hi === lo) return 1
  return clamp((width - lo) / (hi - lo), 0, 1)
}

/** Real-valued (unrounded) widths — the ideal the integer apportionment approximates. */
export function apportionRealWidths(
  tracks: readonly ApportionTrack[],
  width: number,
  options: ApportionOptions = {},
): number[] {
  validate(tracks, width)
  const stretch = options.stretch ?? false
  const lo = sum(tracks.map((c) => c.min))
  const hi = sum(tracks.map((c) => c.max))
  if (width < lo) return tracks.map((c) => c.min)
  if (stretch && width > hi) {
    const excess = width - hi
    if (tracks.length === 0) return []
    if (hi === 0) return tracks.map(() => excess / tracks.length)
    return tracks.map((c) => c.max + (excess * c.max) / hi)
  }
  const t = hi === lo ? 1 : clamp((width - lo) / (hi - lo), 0, 1)
  return tracks.map((c) => c.min + t * (c.max - c.min))
}

/**
 * Webster/Sainte-Laguë incremental apportionment with per-item caps: award
 * `units` indivisible cells one at a time to the item with the highest
 * priority `weight_i / (2*a_i + 1)`, skipping saturated items; ties go to the
 * lowest index. Monotone by construction — apportioning `units + 1` extends
 * apportioning `units` by exactly one cell.
 *
 * The lowest-index tie-break means the leftmost track wins every tied cell.
 * That positional bias is a separate, deliberate knob (rotating or center-out
 * tie-breaks change WHICH track gets the extra cell, not correctness) — do
 * not fold a different tie-break in here silently.
 */
function websterApportion(
  weights: readonly number[],
  caps: readonly number[],
  units: number,
): number[] {
  const n = weights.length
  const awarded = new Array<number>(n).fill(0)
  if (units <= 0 || n === 0) return awarded
  const capacity = sum(caps)
  if (units > capacity) throw new Error(`apportion: ${units} units exceed capacity ${capacity}`)
  // All weights zero (every max is 0 under stretch): weight equally rather
  // than dumping the whole excess on track 0.
  const effective = sum(weights) === 0 ? weights.map(() => 1) : weights
  for (let u = 0; u < units; u++) {
    let best = -1
    let bestPriority = -1
    for (let i = 0; i < n; i++) {
      if (awarded[i]! >= caps[i]!) continue
      const priority = effective[i]! / (2 * awarded[i]! + 1)
      if (priority > bestPriority) {
        bestPriority = priority
        best = i
      }
    }
    if (best < 0) throw new Error(`apportion: no eligible track for unit ${u} of ${units}`)
    awarded[best]!++
  }
  return awarded
}

/**
 * Apportion an integer width across tracks. See the module docstring for the
 * model; see `ApportionResult.feasible` for the escalation contract.
 */
export function apportion(
  tracks: readonly ApportionTrack[],
  width: number,
  options: ApportionOptions = {},
): ApportionResult {
  validate(tracks, width)
  const stretch = options.stretch ?? false
  const mins = tracks.map((c) => c.min)
  const maxes = tracks.map((c) => c.max)
  const lo = sum(mins)
  const hi = sum(maxes)
  const t = hi === lo ? 1 : clamp((width - lo) / (hi - lo), 0, 1)

  if (width < lo) return { widths: mins, t, feasible: false }

  if (stretch && width > hi) {
    const excess = width - hi
    const bonus = websterApportion(
      maxes,
      maxes.map(() => Number.POSITIVE_INFINITY),
      tracks.length === 0 ? 0 : excess,
    )
    return { widths: maxes.map((m, i) => m + bonus[i]!), t, feasible: true }
  }

  const units = Math.min(width, hi) - lo
  const room = tracks.map((c) => c.max - c.min)
  const bonus = websterApportion(room, room, units)
  return { widths: mins.map((m, i) => m + bonus[i]!), t, feasible: true }
}
