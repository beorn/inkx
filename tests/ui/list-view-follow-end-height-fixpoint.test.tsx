/**
 * Follow-end content-height authority must be a FIXED POINT.
 *
 * Bug class: `no-parallel-derivation` (docs/lessons/no-parallel-derivation.md).
 * The follow-end pin and the at-end test each derive "total content rows" from
 * a DIFFERENT authority:
 *   - count-space   `heightModel.totalRows()`  (measured-where-mounted ?? estimate)
 *   - pixel-space   `useScrollState().contentHeight`  (Flexily-measured rects)
 * and ListView merges them with `Math.max(...)` before computing the pin
 * (`scrollableRows`). When the bottom rows are long wrapped messages, the
 * measured height exceeds the estimate by ~N rows; pinning to the bottom
 * mounts/measures those rows, the merged total leaps by N, the index window
 * re-anchors, the rows un-mount back to estimates, the merged total drops N —
 * an A/B/A/B limit cycle (observed live: a constant +10-row swing).
 *
 * The invariant under test: with a SETTLED (constant) pixel-space layout
 * height, the resolved follow-end content-row total is INDEPENDENT of the
 * count-space estimate, so the pin is a fixed point. A `Math.max()` of two
 * leapfrogging authorities violates this the instant count-space exceeds
 * layout; a single chosen authority (pixel-space when present, count-space
 * only at bootstrap) cannot.
 *
 * HONEST SCOPE (load-bearing, see bead): this is a forward-looking invariant
 * on the pure resolver, NOT a closed-form reproduction of the live A/B limit
 * cycle. The live oscillation needs budget-capped index-window eviction + real
 * terminal measurement timing + React commit ordering; no closed-form unit
 * recurrence (three were attempted) reproduces it, and the in-process
 * render-trace shows ZERO idle repaints in termless — so termless cannot
 * reproduce it either (confirms the @agent/5 forensic). The fix is justified
 * structurally (no-parallel-derivation: eliminate the second authority) and
 * guarded going forward by (a) this invariant, (b) the SILVERY_STRICT
 * `scroll_height` slug that throws on steady-state divergence in a LIVE
 * session, and (c) the full ListView scroll-anchoring suite staying green.
 *
 * Bead: @km/code/v0.2/19633-output-flicker.
 */

import { describe, expect, test } from "vitest"
import { createContentGeometry } from "../../packages/ag-react/src/ui/components/list-view/scroll-position"
import { createHeightModel } from "../../packages/ag-react/src/ui/components/list-view/height-model"
import {
  resolveFollowEndContentRows,
  resolveFollowEndTopRow,
} from "../../packages/ag-react/src/ui/components/list-view/content-height-authority"

const VIEWPORT = 40

/**
 * Build the content geometry for a given mounted window. Items inside
 * [mountedFrom, mountedTo) are "measured" tall; the rest fall back to the
 * estimate — the exact measured-vs-estimated divergence that drives the live
 * oscillation when the follow pin re-anchors the window each frame.
 */
function geometryForWindow(opts: {
  itemCount: number
  estimateRows: number
  measuredRows: number
  mountedFrom: number
  mountedTo: number
}) {
  const model = createHeightModel({
    itemCount: opts.itemCount,
    gap: 0,
    estimate: () => opts.estimateRows,
  })
  for (let i = opts.mountedFrom; i < opts.mountedTo; i++) model.setMeasured(i, opts.measuredRows)
  const geometry = createContentGeometry<number>({ model, keyAtIndex: (i) => i })
  return { model, geometry }
}

describe("19633 follow-end content-height authority is a fixed point", () => {
  test("resolveFollowEndContentRows ignores count-space leapfrog when pixel-space layout is settled", () => {
    // Pixel-space (Flexily) layout height is the settled truth: 8 long rows ×
    // 13 measured rows each = 104 content rows. It does NOT depend on which
    // index window happens to be mounted this frame.
    const settledLayoutContentRows = 104

    // Count-space total leapfrogs frame-to-frame as the window re-anchors.
    const countSpaceWhenBottomMounted = 104
    const countSpaceWhenBottomEstimated = 80

    const a = resolveFollowEndContentRows({
      layoutContentRows: settledLayoutContentRows,
      countSpaceContentRows: countSpaceWhenBottomMounted,
      tailReserveRows: 0,
    })
    const b = resolveFollowEndContentRows({
      layoutContentRows: settledLayoutContentRows,
      countSpaceContentRows: countSpaceWhenBottomEstimated,
      tailReserveRows: 0,
    })

    // SINGLE authority: with a settled pixel-space layout, the resolved total
    // is identical regardless of the count-space leapfrog.
    expect(a).toBe(b)
    expect(a).toBe(settledLayoutContentRows)
  })

  test("count-space is used ONLY at bootstrap (before first pixel-space snapshot)", () => {
    // Before the first useScrollState snapshot, layoutContentRows === 0 — the
    // documented bootstrap window where estimates are the only signal.
    const bootstrap = resolveFollowEndContentRows({
      layoutContentRows: 0,
      countSpaceContentRows: 80,
      tailReserveRows: 0,
    })
    expect(bootstrap).toBe(80)
  })

  test("tail reserve folds into the pixel-space authority too (no double count from count-space)", () => {
    // Reserve is added once, to the chosen authority. Pixel-space wins, then
    // + reserve — never count-space + reserve while pixel-space is present.
    const resolved = resolveFollowEndContentRows({
      layoutContentRows: 104,
      countSpaceContentRows: 80,
      tailReserveRows: 6,
    })
    expect(resolved).toBe(110)
  })

  test("single authority is independent of count-space — the no-parallel-derivation invariant", () => {
    // The core invariant, stated directly: with a settled pixel-space layout,
    // sweeping count-space across its whole leapfrog range never moves the
    // resolved total. The OLD `Math.max(count, layout)` merge violated this
    // the moment count-space transiently exceeded layout; the single authority
    // cannot. (We do NOT assert a synthetic oscillation here — see this file's
    // header and the bead notes: no closed-form unit model reproduces the live
    // limit cycle, which needs budget-capped window eviction + real
    // measurement timing. This invariant is the honest, checkable core.)
    const settledLayout = 104
    const resolvedAcrossSweep = new Set<number>()
    for (let countSpace = 1; countSpace <= 400; countSpace += 7) {
      resolvedAcrossSweep.add(
        resolveFollowEndContentRows({
          layoutContentRows: settledLayout,
          countSpaceContentRows: countSpace,
          tailReserveRows: 0,
        }),
      )
    }
    expect(
      resolvedAcrossSweep.size,
      `with a settled layout, the resolved total must be invariant to count-space ` +
        `(saw ${[...resolvedAcrossSweep].join(",")})`,
    ).toBe(1)
    expect([...resolvedAcrossSweep][0]).toBe(settledLayout)
  })

  test("resolveFollowEndTopRow reaches a fixed point within one step under the leapfrog", () => {
    const itemCount = 60
    const estimateRows = 3
    const measuredRows = 13 // long wrapped assistant rows

    // Settled pixel-space layout height: the real laid-out content. It does
    // not change as the mounted index window slides — that is the whole point
    // of `useScrollState` being the single source of truth.
    const settledLayoutContentRows = itemCount * measuredRows

    // The pin computed at frame N decides the mounted window at frame N+1.
    function pinFromMountedWindow(prevTopRow: number): number {
      const mountedFrom = Math.max(0, Math.floor(prevTopRow / measuredRows))
      const mountedTo = Math.min(itemCount, mountedFrom + Math.ceil(VIEWPORT / 1) + 4)
      const { model, geometry } = geometryForWindow({
        itemCount,
        estimateRows,
        measuredRows,
        mountedFrom,
        mountedTo,
      })
      const contentRows = resolveFollowEndContentRows({
        layoutContentRows: settledLayoutContentRows,
        countSpaceContentRows: model.totalRows(),
        tailReserveRows: 0,
      })
      const measuredMaxTopRow = Math.max(0, Math.round(contentRows - VIEWPORT))
      return resolveFollowEndTopRow({
        geometry,
        viewportHeight: VIEWPORT,
        measuredMaxTopRow,
        contentRows,
      })
    }

    let top = 0
    const seen: number[] = []
    for (let i = 0; i < 8; i++) {
      top = pinFromMountedWindow(top)
      seen.push(top)
    }

    const last = seen[seen.length - 1]!
    const secondLast = seen[seen.length - 2]!
    expect(
      last,
      `follow-end pin must reach a fixed point; tail of iteration sequence was ${JSON.stringify(seen)} ` +
        `(an A/B limit cycle shows two alternating values)`,
    ).toBe(secondLast)
  })
})
