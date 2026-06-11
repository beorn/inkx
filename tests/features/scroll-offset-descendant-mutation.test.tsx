/**
 * Regression: a scroll container's offset changing in the SAME frame that a
 * deeply-nested descendant's text mutates must not use Tier 1 (buffer shift).
 *
 * Bead: @km/silvery/19754-streaming-cls-incremental-scroll-mismatch
 *
 * Shape (mirrors silvercode's streaming transcript with follow=end):
 *
 *   <Box overflow="scroll" scrollOffset={off}>      ← scroll container
 *     <Box> <Box> ... <Text>{liveText}</Text>       ← deep descendant mutates
 *     ...more rows...
 *   </Box>
 *
 * When the active turn streams a new text-delta, two things happen in the
 * same committed frame: (1) the deep `<Text>` content changes, and (2) the
 * follow-end controller bumps `scrollOffset` to keep the tail pinned. Tier 1
 * shifts the previous buffer by the scroll delta and only re-renders newly
 * exposed edge children — but the mutated descendant is NOT a newly exposed
 * edge child, so its stale (pre-mutation) pixels get shifted to a new viewport
 * position. The incremental buffer then carries old text where a fresh render
 * has new text → SILVERY_STRICT mismatch.
 *
 * The descendant mutation propagates SUBTREE_BIT up the parent chain (reconciler
 * `markSubtreeDirty` walks to root), so the scroll container's DIRECT child reads
 * dirty even though the mutating node is several levels deeper. The
 * `descendantDirty` gate in `planScrollRender` demotes this frame to Tier 2
 * (full viewport clear), which re-renders the mutated descendant correctly.
 *
 * SILVERY_STRICT (on by default for vendor tests) catches the corruption: the
 * incremental render diverges from a fresh render at the stale cells.
 *
 * NOTE — this is a STRICT *scaffold*, not the baseline-failing regression
 * catcher. At `createRenderer` scale the single-pass synchronous commit lands
 * the combined scroll+mutation frame in Tier 3 (subtree-only), which re-renders
 * the dirty descendant correctly even on baseline — so this test passes with
 * AND without the `descendantDirty` gate. The production bug needs the
 * silvercode multi-pass layout-feedback convergence (follow=end re-pin) to
 * produce the precise `visibleRangeChanged + Tier-1 shift` frame where the
 * mutated child is shifted rather than freshly exposed. The true end-to-end
 * catcher is `apps/silvercode/tests/visual/streaming-cls.spec.tsx` (fails on
 * baseline at the `off=5->7` frame, passes with the gate). This scaffold pins
 * the SUBTREE_BIT-bubbles-to-direct-child invariant the gate relies on and is
 * the local STRICT harness for any future regression that DOES reproduce at
 * unit scale. Same "synthetic doesn't always reproduce" shape as the
 * incremental-bg-shrink-move family.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

describe("scroll offset change + deep descendant text mutation in same frame", () => {
  test("mutating a deeply-nested Text while the scroll offset changes does not shift stale pixels", () => {
    const COLS = 40
    const ROWS = 10
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Each row nests the mutable text several levels deep so the mismatching
    // node is NOT a direct child of the scroll container — exercising the
    // SUBTREE_BIT-bubbles-to-direct-child invariant the gate relies on.
    function Row({ index, live }: { index: number; live: string }) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="column">
            <Box flexDirection="column">
              <Text>
                row {index} {live}
              </Text>
            </Box>
          </Box>
        </Box>
      )
    }

    function Harness({ scrollOffset, live }: { scrollOffset: number; live: string }) {
      const rows = Array.from({ length: 30 }, (_, i) => i)
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box
            width={COLS}
            height={ROWS}
            overflow="scroll"
            scrollOffset={scrollOffset}
            flexDirection="column"
          >
            {rows.map((i) => (
              <Row key={i} index={i} live={i === 12 ? live : "static"} />
            ))}
          </Box>
        </Box>
      )
    }

    const app = render(<Harness scrollOffset={0} live="v0" />)

    // Scroll so row 12 (the mutable one) is inside the viewport. Each
    // subsequent frame mutates its deep Text AND changes the scroll offset
    // in the SAME rerender. The viewport is 10 rows tall and each row is one
    // line, so offsets in [3, 12] keep row 12 visible.
    app.rerender(<Harness scrollOffset={4} live="v0" />)

    // After each mutation+scroll frame the visible text must reflect the new
    // value, never the stale shifted value. SILVERY_STRICT already asserts
    // incremental == fresh cell-by-cell on every render; these are the
    // human-readable companion assertions.
    app.rerender(<Harness scrollOffset={6} live="v1" />)
    expect(app.text).toContain("v1")
    expect(app.text).not.toContain("v0")

    app.rerender(<Harness scrollOffset={9} live="v2" />)
    expect(app.text).toContain("v2")
    expect(app.text).not.toContain("v1")

    app.rerender(<Harness scrollOffset={12} live="v3" />)
    expect(app.text).toContain("v3")
    expect(app.text).not.toContain("v2")
  })
})
