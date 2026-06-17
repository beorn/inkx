/**
 * content-height-authority — the SINGLE source of truth for "how many content
 * rows does the follow-end transcript have?".
 *
 * ## Why this module exists
 *
 * `no-parallel-derivation` (docs/lessons/no-parallel-derivation.md): the
 * follow-end pin and the at-end test historically derived total content rows
 * from TWO authorities and merged them with `Math.max(...)`:
 *
 *   - count-space  `heightModel.totalRows()`         (measured-where-mounted ?? estimate)
 *   - pixel-space  `useScrollState().contentHeight`  (Flexily-measured child rects)
 *
 * These two answers are one render-pass out of phase during measurement
 * convergence: a long wrapped row measures tall on commit N (count-space sees
 * it immediately), while the pixel-space layout height — derived from the
 * leading/trailing spacers sized off the PREVIOUS pass's estimate — only
 * catches up on commit N+1. `Math.max()` lets whichever authority is
 * momentarily larger win, so the follow-end pin alternates between two row
 * targets and the viewport oscillates A,B,A,B forever (the
 * @km/code/v0.2/19633 limit cycle: a constant ~10-row vertical swing).
 *
 * The fix is the `virtualizer-from-layout` template: pick ONE authority.
 * Pixel-space is the truth-of-render (it is exactly what got laid out), so it
 * wins outright whenever it is available. Count-space estimates are used ONLY
 * during bootstrap — the documented window (`useScrollState` returns null /
 * contentHeight 0) before the first layout pass syncs. The `Math.max()` merge
 * remains valid for the cosmetic scrollbar thumb (an over-estimate there is
 * harmless), but it must NEVER feed the pin or the at-end test.
 *
 * Both the follow-end pin (`resolveFollowEndTopRow`) and the at-end test
 * (`computedAtEnd` in ListView) consume `resolveFollowEndContentRows` so they
 * cannot disagree across the measurement phase-lag — that shared single
 * authority is what makes the settled viewport a render fixpoint.
 */

import { resolveScrollPositionTop, type ContentGeometry, type Key } from "./scroll-position"

export interface FollowEndContentRowsInput {
  /**
   * Pixel-space content height from `useScrollState().contentHeight`
   * (Flexily-measured rects). `0` means "no layout snapshot yet" (bootstrap).
   */
  layoutContentRows: number
  /**
   * Count-space total from `heightModel.totalRows()` (measured-where-mounted,
   * estimate elsewhere). Used ONLY at bootstrap.
   */
  countSpaceContentRows: number
  /** Tail-reserve rows reserved below the last item in follow-end mode. */
  tailReserveRows: number
}

/**
 * Resolve the single authoritative content-row total for the follow-end pin
 * and the at-end test.
 *
 * - Pixel-space (`layoutContentRows > 0`) wins outright — it is the laid-out
 *   truth and does not leapfrog with the count-space estimate.
 * - Count-space is used ONLY at bootstrap, before the first `useScrollState`
 *   snapshot exists (`layoutContentRows === 0`).
 * - Tail reserve is folded in ONCE, onto the chosen authority — never
 *   count-space + reserve while pixel-space is present (that is the double
 *   authority that oscillates).
 *
 * Invariant: holding `layoutContentRows` constant (a settled layout), the
 * output is independent of `countSpaceContentRows`. That is the fixed-point
 * property the 19633 limit cycle violated.
 */
export function resolveFollowEndContentRows({
  layoutContentRows,
  countSpaceContentRows,
  tailReserveRows,
}: FollowEndContentRowsInput): number {
  const reserve = Number.isFinite(tailReserveRows) ? Math.max(0, tailReserveRows) : 0
  // Pixel-space is the single authority once a layout snapshot exists. During
  // bootstrap (no snapshot) fall back to the count-space estimate.
  const base = layoutContentRows > 0 ? layoutContentRows : Math.max(1, countSpaceContentRows)
  return Math.max(1, base + reserve)
}

export interface FollowEndTopRowInput<K extends Key = Key> {
  geometry: ContentGeometry<K>
  viewportHeight: number
  /**
   * The measured max-top-row derived from the SINGLE content-row authority
   * (`resolveFollowEndContentRows` − viewport). Replaces the old
   * `scrollableRows` that was computed from the `Math.max()` merge.
   */
  measuredMaxTopRow: number
  /**
   * The single content-row authority itself (`resolveFollowEndContentRows`).
   * Used to derive the geometry-space end row against the SAME total, so the
   * pin never mixes count-space geometry with a different merged total.
   */
  contentRows: number
}

/**
 * Resolve the follow-end pin's top row from the single content-height
 * authority.
 *
 * Follow=end must share the same content-height authority as the scroll cap.
 * During layout convergence, rendered layout can observe a newly measured row
 * one frame before the geometry's height model is updated; both inputs here
 * derive from `resolveFollowEndContentRows`, so the geometry-end row and the
 * measured cap agree and the pin is a fixed point.
 *
 * The `Math.max(...)` is retained ONLY as a defensive floor for the
 * within-pass measurement lead (geometry's height model can momentarily trail
 * `contentRows` by a row); since every term derives from the same authority
 * they converge to the same value, so the `max()` no longer merges two
 * competing sources — it just picks the up-to-date one.
 */
export function resolveFollowEndTopRow<K extends Key = Key>({
  geometry,
  viewportHeight,
  measuredMaxTopRow,
  contentRows,
}: FollowEndTopRowInput<K>): number {
  const geometryTopRow = resolveScrollPositionTop<K>({ kind: "end" }, geometry, {
    height: viewportHeight,
  }).topRow
  // Authority-derived cap from the SAME contentRows total (not the count-space
  // geometry.maxTopRow, which is the second authority that oscillated).
  const authorityCap = Math.max(0, Math.round(contentRows - Math.max(0, viewportHeight)))
  return Math.max(geometryTopRow, measuredMaxTopRow, authorityCap)
}
