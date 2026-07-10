/**
 * Regression: a descendant whose LAYOUT overflows a transparent clearing node
 * but whose PAINT is clipped away by an intermediate `overflow="hidden"`
 * ancestor must NOT have that (never-painted) overflow region cleared over a
 * sibling that owns those cells.
 *
 * This is the gap left by the `nodeEmitsOwnPixels` gate (@si/render/20598).
 * That gate suppresses the overflow clear only when the OVERFLOWING descendant
 * is transparent (a bg-less, theme-less Box paints nothing, so the clone still
 * holds the sibling's pixels). But an OPAQUE descendant — a `<Text>` — reports
 * `nodeEmitsOwnPixels === true`, so the gate lets its overflow clear through.
 * When an intermediate clipping ancestor clipped that text's paint back inside
 * the clearing node, the text NEVER painted the overflow cells, yet the clear
 * still nulls them — stomping whatever sibling owns them (a clean vertical
 * divider that never repaints).
 *
 * Production signature (@si/render/20989, live hab-deck "attaching" repaint):
 * the deck's "awaiting / fleet anything urgent" status `<Text>` nodes lay out
 * at x=26 (one column left of the deck at x=27), clipped to the pane content
 * (col 27+) by the pane's nested `overflow="hidden"` boxes — so they never
 * paint the col-26 sidebar divider. When the status text moved (rows 30-31 ->
 * 21-22), the DECK's (transparent, clipBounds=undefined) descendant-overflow
 * clear nulled the divider `│` at (26,30-31); the divider (a clean sibling
 * subtree) never repainted. STRICT `MISMATCH at (26,30): incremental=" " vs
 * fresh="│"` on the standalone follow-up frame.
 *
 * Two independent clears had to be fixed together, both exercised here:
 *   1. the intermediate CLIPPER as its own clearing node — its horizontal
 *      overflow strips must clamp to its own `clipBounds` (the left/right
 *      branches did not, unlike the already-clamped above/below branches).
 *   2. the transparent DECK clearing node recursing THROUGH the clipper — the
 *      recursion must narrow `clipBounds` at each clipping ancestor so a
 *      descendant's overflow is intersected with the clip that bounded its paint.
 *
 * Fixture is realistic scale (50+ nodes): a tall `│` divider sibling plus a
 * transparent region wrapping a clipping pane with ~25 opaque text rows.
 * SILVERY_STRICT (auto-enabled by createRenderer) verifies incremental ≡ fresh
 * on every rerender; the mismatch throws inside rerender before the assertions.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const COLS = 60
const ROWS = 40
const SIDEBAR_W = 20
// Divider occupies exactly col SIDEBAR_W (20); the region begins at col 21.
const REGION_W = COLS - SIDEBAR_W - 1 // 39
const ROW_COUNT = 25

// Tall vertical `│` divider — the CLEAN left sibling that owns col 20 on every
// row. Mirrors the PaneDivider shape from divider-overflow-clear.test.tsx: a
// pinned 1-col Box wrapping a long `wrap` Text so CSS §4.5 auto-min-size does
// not pin it to the 200-glyph token width.
function Divider(): React.ReactElement {
  return (
    <Box flexShrink={0} flexGrow={0} flexBasis={1} width={1} flexDirection="column">
      <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
        <Text color="cyan" wrap="wrap" minWidth={0}>
          {"│".repeat(200)}
        </Text>
      </Box>
    </Box>
  )
}

// Transparent clearing node (no bg, no clip → clipBounds passes through as
// undefined) wrapping an intermediate `overflow="hidden"` clipper. Each row's
// opaque `<Text>` is pushed left by `shift` via a wrapper's negative margin so
// its layout x crosses into the divider's column, while the clipper clips its
// PAINT back to the region — so col 20 is never painted by the text.
function Region({ shift }: { shift: number }): React.ReactElement {
  return (
    <Box width={REGION_W} flexShrink={0} flexDirection="column">
      {/* clipper: fixed at the region's left edge, clips the text's left overflow */}
      <Box width={REGION_W} flexShrink={0} flexDirection="column" overflow="hidden">
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <Box key={i} flexDirection="row">
            {/* negative-margin wrapper drives the opaque text past the clip edge */}
            <Box marginLeft={shift} flexShrink={0} flexDirection="row">
              <Text color="magenta" wrap="truncate">{`pane ${i} content`}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function App({ shift }: { shift: number }): React.ReactElement {
  return (
    <Box width={COLS} height={ROWS} flexDirection="row">
      {/* sidebar spacer (cols 0..19) */}
      <Box width={SIDEBAR_W} flexShrink={0} flexDirection="column">
        <Text>modules</Text>
      </Box>
      {/* divider at col 20 — the clean sibling the overflow clear must not stomp */}
      <Divider />
      {/* region (cols 21..59) — transparent clearing node with a clipping pane */}
      <Region shift={shift} />
    </Box>
  )
}

describe("regression: clipped opaque-text overflow must not stomp a divider sibling (@si/render/20989)", () => {
  test("clipped text retreating from the divider column keeps the divider `│` (STRICT incremental ≡ fresh)", () => {
    const render = createRenderer({ cols: COLS, rows: ROWS })

    // Frame 0: text pushed LEFT into the divider column (layout x=20), clipped
    // so it paints col 21+. The divider owns col 20. Establishes prevLayout with
    // the text reaching over the divider column.
    const app = render(<App shift={-1} />)
    expect(app.text).toContain("│")

    // Frame 1: text retreats to the region edge (layout x=21). Its prevLayout
    // still starts at col 20, so the region + clipper run their left-overflow
    // clear over the divider column. Without the clip clamp / recursion narrowing,
    // incremental nulls the divider `│` while fresh keeps it → STRICT mismatch
    // thrown here.
    app.rerender(<App shift={0} />)

    // The divider survives on every row it spans.
    expect(app.text).toContain("│")
  })

  test("fresh and incremental renders agree after the overflow retreat", () => {
    const r1 = createRenderer({ cols: COLS, rows: ROWS })
    const r2 = createRenderer({ cols: COLS, rows: ROWS })

    const incremental = r1(<App shift={-1} />)
    incremental.rerender(<App shift={0} />)

    const fresh = r2(<App shift={0} />)

    expect(incremental.text).toBe(fresh.text)
  })
})
