/**
 * Content.Row side-slot geometry — pure, unit-testable.
 *
 * The historic inline math floored HALF the remainder into EACH side slot
 * independently, so the slot PAIR consumed two cells for every one the row
 * gained and the middle lane oscillated (shrank as the terminal widened) six
 * times across available 30..43 — split-pane territory. The fix floors ONCE
 * on the pair budget and sends the parity cell to the centering margins:
 * every output below is monotone non-decreasing in `available`, and slot
 * widths are unchanged from the historic values at every width.
 */
export type RowSideGeometry = {
  readonly sideGap: number
  readonly sideSlotWidth: number
  /** Cells actually occupied by the two slots + gaps; never exceeds the pair budget. */
  readonly sideReserve: number
  /** Width left for the middle lane; monotone in `available`. */
  readonly middleAvailable: number
}

/** The middle lane keeps at least this many cells before sides get any. */
export const ROW_MIDDLE_FLOOR = 24

export function computeRowSideGeometry(input: {
  readonly available: number
  readonly hasSideSlots: boolean
  /** Gap cells per side at this width (0 under compact density or below 32). */
  readonly sideGapCells: number
  /** Max slot width per side at this width (0 under compact density). */
  readonly sideSlotMaxWidthCells: number
}): RowSideGeometry {
  const { available, hasSideSlots, sideGapCells, sideSlotMaxWidthCells } = input
  const sideGap = hasSideSlots && available >= 32 ? sideGapCells : 0
  if (!hasSideSlots || sideSlotMaxWidthCells <= 0) {
    return { sideGap, sideSlotWidth: 0, sideReserve: 0, middleAvailable: Math.max(1, available) }
  }
  // One budget for the PAIR, floored once — not half the remainder floored
  // per side. Parity and sub-threshold cells fall to the centering margins,
  // never back out of the middle lane.
  const sideBudget = Math.min(
    Math.max(0, available - ROW_MIDDLE_FLOOR),
    2 * (sideSlotMaxWidthCells + sideGap),
  )
  const sideSlotWidth = Math.max(0, Math.floor(sideBudget / 2) - sideGap)
  const sideReserve = sideSlotWidth > 0 ? (sideSlotWidth + sideGap) * 2 : 0
  const middleAvailable = Math.max(1, available - sideBudget)
  return { sideGap, sideSlotWidth, sideReserve, middleAvailable }
}
