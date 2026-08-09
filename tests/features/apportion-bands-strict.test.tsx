/**
 * `apportion-bands` STRICT slug (@si/apportion-consolidation, item 1).
 *
 * The operator-approved invariant, per frame: **no track below its minimum
 * while a sibling exceeds its maximum.**
 *
 * The subject of the check is the REALIZED geometry, not `apportion()`'s return
 * value. Checking the allocator against itself is a tautology — every branch of
 * `apportion()` provably returns `min_i <= w_i <= max_i` (or `>= max_i` for all
 * tracks under `stretch`), so the conjunction is unreachable there and a runtime
 * check would be theater. What is NOT provable is what happens to those widths
 * afterwards: they become flex props, and flexbox has its own opinion. Between
 * the allocator and the screen sit `flexGrow` without a `maxWidth`, the
 * `flexShrink` fallback whose floor is the author's `minWidth` rather than the
 * track's min-content, the degraded-band escalation, and a measurement
 * round-trip through `useBoxRectDangerously`. Any of those can break the band
 * contract the allocator established, and a site that still does its own
 * arithmetic — the fifth splitter this bead exists to prevent — breaks it by
 * construction.
 *
 * So the band travels with the node as `data-track-band="min,max"` (the
 * `data-subtree-fade` marker idiom) and the layout phase compares it against
 * `boxRect.width` every frame.
 *
 * The conjunction is load-bearing and these tests pin both halves of it: a
 * starved track alone is legible degradation (the table's documented wrap
 * escalation lowers floors on purpose), and a track over its max alone is a
 * `grow` column absorbing genuine free space. Only *together* do they mean
 * width was taken from a track that needed it and given to one that could not
 * use it.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import { TRACK_BAND_ATTR } from "@silvery/ag"
import { Box } from "../../packages/ag-react/src/components/Box"
import { Text } from "../../packages/ag-react/src/components/Text"
import { Content } from "../../packages/ag-react/src/ui/components/Content"

// ---------------------------------------------------------------------------
// Fixture: a realistic-scale table whose track widths were assigned by an
// ad-hoc splitter instead of the shared allocator.
//
// The numbers are the measured pre-consolidation defect shape named in
// tests/table-width-allocation: a quadratic-flexShrink split lets the long
// prose column absorb nearly the whole deficit while short columns yield almost
// nothing, so prose stacks a few characters per line while an id column sits on
// width it cannot use.
//
// Widths are explicit and sum exactly to the row width, so layout is
// deterministic and no OTHER strict invariant (layout-overflow in particular)
// can fire and mask the one under test.
// ---------------------------------------------------------------------------

const ROW_WIDTH = 60

type TrackSpec = { readonly band: readonly [number, number]; readonly width: number }

/** Both halves of the conjunction: prose starved (10 < 12) while id hoards (20 > 12). */
const MISALLOCATED: readonly TrackSpec[] = [
  { band: [10, 12], width: 20 },
  { band: [8, 20], width: 30 },
  { band: [12, 200], width: 10 },
]

/** Starvation alone — the table's documented wrap degradation. No sibling is over its max. */
const DEGRADED_ONLY: readonly TrackSpec[] = [
  { band: [10, 12], width: 12 },
  { band: [8, 20], width: 20 },
  { band: [12, 200], width: 28 },
]

/** Surplus alone — a `grow` track absorbing free space. Nobody is starved. */
const GROWN_ONLY: readonly TrackSpec[] = [
  { band: [10, 12], width: 10 },
  { band: [8, 20], width: 20 },
  { band: [12, 30], width: 30 },
]

const CELL_TEXT = ["id", "label", "prose"] as const

/**
 * 18 body rows + 1 header row, 3 tracks each: 57 cells + 57 texts + 19 rows +
 * 1 root = 134 nodes, well past the 50-node realistic-scale floor. Track-band
 * groups repeat per row, so a per-row check runs 19 times per frame.
 */
function TrackTable({ tracks }: { tracks: readonly TrackSpec[] }): React.ReactElement {
  const row = (key: string) => (
    <Box key={key} flexDirection="row" width={ROW_WIDTH} minWidth={0} overflow="hidden">
      {tracks.map((track, columnIndex) => (
        <Box
          key={columnIndex}
          {...{ [TRACK_BAND_ATTR]: `${track.band[0]},${track.band[1]}` }}
          width={track.width}
          minWidth={track.width}
          maxWidth={track.width}
          flexGrow={0}
          flexShrink={0}
          overflow="hidden"
        >
          <Text minWidth={0} maxWidth="100%" wrap="truncate">
            {`${CELL_TEXT[columnIndex]} ${key}`}
          </Text>
        </Box>
      ))}
    </Box>
  )
  return (
    <Box flexDirection="column" width={ROW_WIDTH}>
      {row("header")}
      {Array.from({ length: 18 }, (_, i) => row(`r${i}`))}
    </Box>
  )
}

function renderTracks(tracks: readonly TrackSpec[]) {
  const render = createRenderer({ cols: ROW_WIDTH, rows: 40 })
  return render(<TrackTable tracks={tracks} />)
}

describe("apportion-bands STRICT slug", () => {
  let saved: string | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    saved = process.env.SILVERY_STRICT
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    resetStrictCache()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  })

  function withStrict<T>(value: string | undefined, fn: () => T): T {
    if (value === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = value
    resetStrictCache()
    return fn()
  }

  test("tier 2 throws when a track is below its min while a sibling is above its max", () => {
    withStrict("2", () => {
      expect(() => renderTracks(MISALLOCATED)).toThrow(/apportion band/i)
    })
  })

  test("the message names both sides of the conjunction and the realized widths", () => {
    withStrict("2", () => {
      let message = ""
      try {
        renderTracks(MISALLOCATED)
      } catch (error) {
        message = (error as Error).message
      }
      // The starved track, its floor, the hoarding sibling, and its ceiling —
      // a violation report that does not name the donor cannot be acted on.
      expect(message).toMatch(/\b10\b/) // starved realized width
      expect(message).toMatch(/\b12\b/) // its min, and the donor's max
      expect(message).toMatch(/\b20\b/) // donor realized width
    })
  })

  test("tier 1 warns instead of throwing", () => {
    withStrict("1", () => {
      expect(() => renderTracks(MISALLOCATED)).not.toThrow()
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/apportion band/i)
    })
  })

  test("the slug isolates: SILVERY_STRICT=apportion-bands fires it alone", () => {
    withStrict("apportion-bands", () => {
      expect(() => renderTracks(MISALLOCATED)).toThrow(/apportion band/i)
    })
  })

  test("per-check skip disables it: SILVERY_STRICT=2,!apportion-bands", () => {
    withStrict("2,!apportion-bands", () => {
      expect(() => renderTracks(MISALLOCATED)).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  test("off by default: unset SILVERY_STRICT neither throws nor warns", () => {
    withStrict(undefined, () => {
      expect(() => renderTracks(MISALLOCATED)).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  test("starvation alone does not fire — legible wrap degradation is not a misallocation", () => {
    withStrict("2", () => {
      expect(() => renderTracks(DEGRADED_ONLY)).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  test("surplus alone does not fire — a grow track may absorb genuine free space", () => {
    withStrict("2", () => {
      expect(() => renderTracks(GROWN_ONLY)).not.toThrow()
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  test("real path: the shared allocator's own tables stay clean across a width sweep", () => {
    // The same fixture shape the width-allocation gate uses — short id, medium
    // label, long prose — rendered through the real Table, which stamps its
    // bands. If Table's flex props ever break the band contract the allocator
    // established, this fires without anyone writing a new assertion.
    const headers = ["Rung", "What lands", "Why"]
    const rows = [
      [
        "0 · shadow",
        "shadow folds land first because everything else reads through them",
        "state was written down rather than derived, so a stale copy could disagree with reality " +
          "and nothing noticed; a jammed seat read as stopped for twelve hours",
      ],
      [
        "1 · services",
        "service supervision and the spawner-written source receipt",
        "services running four-day-old code while reporting healthy is the exact failure the " +
          "receipt makes impossible, because status is never written, only folded",
      ],
      [
        "5 · habwire",
        "reply-is-the-close across two logs",
        "a broadcast with no delivery proof reached six seats, missed the seventh, and nothing " +
          "anywhere said so; completion is asserted by the consumer",
      ],
    ]

    const table = (cols: number) => (
      <Box width={cols} flexDirection="column">
        <Content.Layout fill={false} prose={80} wide={120}>
          <Content.Row>
            <Content.Body width="auto">
              <Content.Table headers={headers} rows={rows} />
            </Content.Body>
          </Content.Row>
        </Content.Layout>
      </Box>
    )

    withStrict("2", () => {
      for (let cols = 70; cols <= 160; cols += 10) {
        const render = createRenderer({ cols, rows: 60 })
        expect(() => render(table(cols))).not.toThrow()
      }
      expect(warnSpy).not.toHaveBeenCalled()
    })

    // Not passing vacuously: the real Table must actually stamp its bands, or
    // the sweep above proves only that a check with nothing to check is quiet.
    // 3 columns x (1 header + 3 body rows) = 12 marked tracks.
    const marked = createRenderer({ cols: 120, rows: 60 })(table(120))
    expect(marked.locator(`[${TRACK_BAND_ATTR}]`).count()).toBe(12)
  })
})
