/**
 * overflowIndicatorOnSurface — borderless ▲N/▼N glyphs paint on the container's
 * inherited surface background instead of the default inverse bar (white-on-gray).
 *
 * Bead: borderless scroll overflow indicators on inherited surface bg.
 *
 * The default borderless overflow indicator paints `{ fg: 15, bg: 8 }` (bright
 * white on dark gray) — an inverse "pill" bar. On a themed surface (e.g. a modal
 * body with its own backgroundColor) that gray pill reads as an artifact. The
 * opt-in `overflowIndicatorOnSurface` prop instead composites the glyph onto the
 * container's inherited surface bg with a muted-but-legible foreground.
 *
 * These tests render a borderless `<Box overflow="scroll" overflowIndicator>`
 * with 50+ short rows (overflowing) at a pinned root width/height (mirroring
 * `<Screen>` per the testing note in silvery CLAUDE.md). They assert:
 *   1. WITH the flag: the ▼ glyph cell's bg EQUALS the container surface bg
 *      (NOT the gray inverse bar).
 *   2. WITHOUT the flag (sibling): the ▼ glyph cell's bg is the gray inverse bar
 *      (pins that the default is unchanged).
 *
 * SILVERY_STRICT=1 (the repo default) auto-verifies incremental == fresh on
 * every render, so these also pin that the on-surface paint path is
 * incremental-safe.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// Surface hex picked so its resolved RGB is unambiguous and distinct from the
// gray inverse bar ({128,128,128}): #3b2a4d → { r: 59, g: 42, b: 77 }.
const SURFACE_HEX = "#3b2a4d"
const SURFACE_RGB = { r: 0x3b, g: 0x2a, b: 0x4d } // 59, 42, 77
const INVERSE_BAR_GRAY = { r: 128, g: 128, b: 128 } // ANSI 8 resolved

const TOTAL_COLS = 40
const TOTAL_ROWS = 16
const BOX_W = 30
const BOX_H = 10

/**
 * Locate the `▼` glyph cell by scanning bottom-up. Returns its column/row plus
 * the resolved bg of that cell. Mirrors findBottomIndicator from km-tui's
 * overflow.test.tsx but reads `app.cell` for resolved RGB instead of raw chars.
 */
function findBottomChevron(
  app: ReturnType<ReturnType<typeof createRenderer>>,
): { col: number; row: number; bg: { r: number; g: number; b: number } | null } | null {
  for (let row = TOTAL_ROWS - 1; row >= 0; row--) {
    for (let col = 0; col < TOTAL_COLS; col++) {
      if (app.cell(col, row).char === "▼") {
        return { col, row, bg: app.cell(col, row).bg }
      }
    }
  }
  return null
}

/**
 * Scroll container fixture. `onSurface` toggles overflowIndicatorOnSurface; the
 * outer Box paints SURFACE_HEX so the inner scroll content inherits it. 60 rows
 * in a height-10 viewport guarantees hiddenBelow > 0 → a bottom `▼N` indicator.
 */
function App({ onSurface }: { onSurface: boolean }) {
  return (
    <Box
      width={TOTAL_COLS}
      height={TOTAL_ROWS}
      flexDirection="column"
      backgroundColor={SURFACE_HEX}
    >
      <Box
        width={BOX_W}
        height={BOX_H}
        flexDirection="column"
        overflow="scroll"
        overflowIndicator
        overflowIndicatorOnSurface={onSurface}
        scrollOffset={0}
      >
        {Array.from({ length: 60 }, (_, i) => (
          <Text key={i}>row {i}</Text>
        ))}
      </Box>
    </Box>
  )
}

describe("overflowIndicatorOnSurface", () => {
  test("borderless ▼ paints on the inherited surface bg, not the inverse bar", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(<App onSurface={true} />)

    const found = findBottomChevron(app)
    expect(found, `no ▼ indicator rendered\nscreen:\n${app.text}`).not.toBeNull()
    if (!found) return

    // The chevron cell's bg must equal the container surface bg — proving the
    // glyph composited onto the surface rather than painting the gray pill.
    expect(
      found.bg,
      `▼ at (${found.col},${found.row}) should sit on surface ${SURFACE_HEX}, got ${JSON.stringify(found.bg)}`,
    ).toEqual(SURFACE_RGB)

    // And explicitly NOT the gray inverse bar.
    expect(found.bg).not.toEqual(INVERSE_BAR_GRAY)
  })

  test("WITHOUT the flag, borderless ▼ keeps the gray inverse bar (default unchanged)", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(<App onSurface={false} />)

    const found = findBottomChevron(app)
    expect(found, `no ▼ indicator rendered\nscreen:\n${app.text}`).not.toBeNull()
    if (!found) return

    // Default path: the chevron sits on the dark-gray inverse bar (ANSI 8).
    expect(
      found.bg,
      `▼ at (${found.col},${found.row}) should keep the gray inverse bar, got ${JSON.stringify(found.bg)}`,
    ).toEqual(INVERSE_BAR_GRAY)

    // And explicitly NOT the surface bg (that would mean the flag leaked).
    expect(found.bg).not.toEqual(SURFACE_RGB)
  })

  test("on-surface chevron foreground is a resolved muted glyph (count stays legible)", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: TOTAL_ROWS })
    const app = render(<App onSurface={true} />)

    const found = findBottomChevron(app)
    expect(found).not.toBeNull()
    if (!found) return

    const cell = app.cell(found.col, found.row)
    // The glyph must carry a foreground distinct from the surface bg, otherwise
    // the count would be invisible-on-surface. (Muted theme token or fg=8.)
    expect(cell.fg, `▼ fg should be a visible muted color, not null`).not.toBeNull()
    expect(cell.fg, `▼ fg must differ from the surface bg to stay legible`).not.toEqual(SURFACE_RGB)
  })
})
