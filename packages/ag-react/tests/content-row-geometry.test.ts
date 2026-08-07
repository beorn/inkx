/**
 * Monotonicity gate for Content.Row side-slot geometry
 * (@si/apportion-consolidation): as the row WIDENS, the middle lane must
 * never SHRINK and the side slots must never shrink. The historic per-side
 * floor violated this six times across available 30..43.
 */
import { describe, expect, test } from "vitest"
import { computeRowSideGeometry, ROW_MIDDLE_FLOOR } from "../src/ui/components/content-row-geometry"

/** Mirrors contentSideSpacingForWidth: compact (≤29) has no side chrome. */
function chrome(available: number): { sideGapCells: number; sideSlotMaxWidthCells: number } {
  return available <= 29
    ? { sideGapCells: 0, sideSlotMaxWidthCells: 0 }
    : { sideGapCells: 1, sideSlotMaxWidthCells: 8 }
}

function at(available: number) {
  return computeRowSideGeometry({ available, hasSideSlots: true, ...chrome(available) })
}

describe("Content.Row side geometry", () => {
  test("middle lane and slots are monotone across the full sweep (the 30..43 defect band)", () => {
    // The sweep starts INSIDE the spacious regime: the compact→spacious
    // density flip at 29→30 makes side chrome appear and legitimately costs
    // the middle lane once (see the density-boundary test below). The defect
    // this gates is the oscillation WITHIN a regime.
    const violations: string[] = []
    let prev = at(30)
    for (let available = 31; available <= 200; available++) {
      const cur = at(available)
      if (cur.middleAvailable < prev.middleAvailable) {
        violations.push(
          `available ${available - 1}->${available}: middle ${prev.middleAvailable}->${cur.middleAvailable}`,
        )
      }
      if (cur.sideSlotWidth < prev.sideSlotWidth) {
        violations.push(
          `available ${available - 1}->${available}: slot ${prev.sideSlotWidth}->${cur.sideSlotWidth}`,
        )
      }
      prev = cur
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })

  test("slot widths match the historic progression (only the oscillation is gone)", () => {
    // Historic slot values, verified against the pre-fix inline math.
    const expected: Record<number, number> = {
      30: 3,
      31: 3,
      32: 3,
      33: 3,
      34: 4,
      36: 5,
      38: 6,
      40: 7,
      42: 8,
      60: 8,
    }
    for (const [available, slot] of Object.entries(expected)) {
      expect(at(Number(available)).sideSlotWidth, `available=${available}`).toBe(slot)
    }
  })

  test("accounting: reserve never exceeds the budget and middle keeps its floor", () => {
    for (let available = 25; available <= 200; available++) {
      const g = at(available)
      expect(g.sideReserve + g.middleAvailable).toBeLessThanOrEqual(available)
      if (available >= ROW_MIDDLE_FLOOR) {
        expect(g.middleAvailable).toBeGreaterThanOrEqual(ROW_MIDDLE_FLOOR)
      }
    }
  })

  test("density boundary 29→30 is the one sanctioned middle-lane drop: chrome appears once", () => {
    // Pre-existing and deliberate: crossing compact→spacious brings the side
    // slots into existence, which costs the middle lane once (29 → 24). This
    // is a density decision, not the oscillation defect; pinning it here
    // keeps the exception visible instead of silently absorbed by the sweep.
    expect(at(29)).toEqual({ sideGap: 0, sideSlotWidth: 0, sideReserve: 0, middleAvailable: 29 })
    expect(at(30).middleAvailable).toBe(24)
    expect(at(30).sideSlotWidth).toBe(3)
  })

  test("no side slots or compact density: middle takes everything", () => {
    expect(
      computeRowSideGeometry({
        available: 80,
        hasSideSlots: false,
        sideGapCells: 1,
        sideSlotMaxWidthCells: 8,
      }),
    ).toEqual({ sideGap: 0, sideSlotWidth: 0, sideReserve: 0, middleAvailable: 80 })
    expect(at(28).sideSlotWidth).toBe(0)
    expect(at(28).middleAvailable).toBe(28)
  })
})
