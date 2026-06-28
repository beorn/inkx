/**
 * Regression: a descendant that overflows into a BORDERED ANCESTOR's border
 * column and then retreats must not drop the ancestor's border on the
 * incremental render.
 *
 * Layout shape (the @si/render/20529-rapid-border deck-pane signature):
 *
 *   outer box (borderStyle, x=0, width W)         — right border `║` at col W-1
 *   └─ content box (transparent, x=1, width W-2)  — nodeRight = W-1
 *      └─ child box (width W-1 → prevRight = W)    — reaches col W-1 (the border)
 *         └─ N height-pinned rows                  — realistic-scale subtree
 *
 * Frame 1 establishes the child's prevLayout reaching the border column.
 * Frame 2 SHRINKS the child horizontally (width W-1 → 3; rows are height-pinned
 * so nothing overflows vertically and no ancestor cascade-clears the subtree).
 * The content box (nodeRight = W-1) sees the child's prevRight = W > W-1, so it
 * clears the overflow strip at col W-1 — which is the OUTER box's right-border
 * column. The outer box's full-rect overflow check (`prevRight > nodeRight`,
 * i.e. W > W) misses the descendant (it sat exactly on the border), so without
 * the content-area inset the outer box never repaints its border and the
 * cleared column stays blank: STRICT diverges (incremental " " vs fresh "║").
 *
 * The clearing node keeps hasPrevBuffer=true (no ancestor cascade-fresh), which
 * mirrors the deck's content box at (28,2) clearing col 149 with the outer
 * (27,0) double-border pane left clean.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

describe("descendant overflow into a bordered ancestor's border column", () => {
  // Rows are height-pinned (height=1, flexShrink=0) so a width change on the
  // child can never add vertical extent — keeping the overflow strictly
  // horizontal into the border column.
  function Pane({ wide, W, H, rows }: { wide: boolean; W: number; H: number; rows: number }) {
    return (
      <Box borderStyle="double" width={W} height={H}>
        {/* Transparent content box: fills inside the border (x=1, width W-2,
            nodeRight = W-1). It is the node that clears the overflow strip. */}
        <Box flexGrow={1} flexDirection="column">
          {/* Overflowing child: wide → width W-1 from x=1 → prevRight = W,
              reaching the outer border column W-1. Narrow → shrinks
              horizontally → its layout changes and the content box clears
              col W-1. */}
          <Box width={wide ? W - 1 : 3} flexShrink={0} flexDirection="column">
            {Array.from({ length: rows }, (_, i) => (
              <Box key={i} height={1} flexShrink={0} overflow="hidden">
                <Text wrap="truncate">{`agent line ${i}`}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    )
  }

  test("right border survives when an overflowing descendant retreats (border at buffer edge)", () => {
    const W = 50
    const H = 30
    const rows = 26 // fits in the H-2 = 28-row content area (Box+Text = 52 nodes)
    const render = createRenderer({ cols: W, rows: H })

    // Frame 1: the child overflows to the border column (establishes prevLayout).
    const app = render(<Pane wide W={W} H={H} rows={rows} />)
    expect(app.term.buffer.getCell(W - 1, 1).char).toBe("║")

    // Frame 2: the child shrinks. STRICT auto-verifies incremental === fresh
    // inside rerender; the explicit per-row assertion is a final defense.
    app.rerender(<Pane wide={false} W={W} H={H} rows={rows} />)
    const buf = app.term.buffer
    for (let y = 1; y < H - 1; y++) {
      expect(buf.getCell(W - 1, y).char, `right border dropped at (${W - 1},${y})`).toBe("║")
    }
  })

  test("right border survives when the bordered ancestor is NOT at the buffer edge", () => {
    // Same class, but the outer box sits inside a wider buffer so the dropped
    // column is unambiguously the border (not a buffer-edge clip artifact).
    const W = 50
    const H = 30
    const rows = 26
    const render = createRenderer({ cols: W + 8, rows: H })

    const app = render(<Pane wide W={W} H={H} rows={rows} />)
    expect(app.term.buffer.getCell(W - 1, 1).char).toBe("║")

    app.rerender(<Pane wide={false} W={W} H={H} rows={rows} />)
    const buf = app.term.buffer
    for (let y = 1; y < H - 1; y++) {
      expect(buf.getCell(W - 1, y).char, `right border dropped at (${W - 1},${y})`).toBe("║")
    }
  })
})
