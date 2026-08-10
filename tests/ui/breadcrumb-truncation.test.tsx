/**
 * A breadcrumb segment must never be shown as a different name than it is.
 *
 * The defect: `Breadcrumb` stacked TWO independent width-reducing mechanisms on
 * the same content — flexbox shrinking an `overflow="hidden"` wrapper Box, and
 * `wrap="truncate"` on the text inside it. Which one won was an arithmetic
 * accident of how flex distributed the shrink, so the SAME label at the SAME
 * allocated width rendered both ways: at a 40-cell container `@hh` came out
 * `@h` (silent), and at 34 it came out `@…` (honest). A reader who sees `…`
 * knows to widen the terminal; a reader who sees `@h` just reads the wrong name.
 *
 * Asserted as a property over widths rather than as pinned frames: the exact
 * per-segment arithmetic is a legitimate retune, and pinning it would gate the
 * wrong thing while still passing for the defect. What a reader depends on is
 * that every segment is whole or visibly elided — at every width, not at the
 * one width someone happened to screenshot.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Breadcrumb } from "@silvery/ag-react"

const LABELS = ["@hh", "tent", "22467-config-ergonomics-one-slice"] as const

/** Whole, or a prefix that ends in the ellipsis announcing the rest is gone. */
function isHonest(rendered: string, label: string): boolean {
  if (rendered.includes(label)) return true
  for (let length = label.length - 1; length >= 1; length--) {
    if (rendered.includes(`${label.slice(0, length)}…`)) return true
  }
  // Fully elided — the segment yielded its cells entirely. Honest only if some
  // ellipsis stands in its place; a segment that simply vanishes is silent.
  return false
}

function renderAt(width: number, labels: readonly string[] = LABELS): string {
  const render = createRenderer({ cols: 120, rows: 3 })
  const app = render(
    <Box width={width} height={1}>
      <Breadcrumb
        items={labels.map((label) => ({ label }))}
        currentIndex={-1}
        separatorSpacing="compact"
      />
    </Box>,
  )
  return app.lines[0]?.replace(/\s+$/u, "") ?? ""
}

describe("Breadcrumb truncation is never silent", () => {
  // Down to the width where the mins stop fitting and elision takes over; every
  // step in between is a width some terminal actually is.
  const WIDTHS = [50, 44, 40, 36, 34, 30, 26, 24, 20, 16, 12, 10, 8]

  test.each(WIDTHS)("at %i cells every segment is whole or visibly elided", (width) => {
    const rendered = renderAt(width)
    const silent = LABELS.filter((label) => !isHonest(rendered, label))
    // The rendered bar is in the message because a bare list of names does not
    // show WHICH character it stopped at.
    expect(silent, `rendered: |${rendered}|`).toEqual([])
  })

  test("never renders wider than the box it was given", () => {
    for (const width of WIDTHS) {
      expect(renderAt(width).length, `width ${width}`).toBeLessThanOrEqual(width)
    }
  })

  test("a segment that still fits whole is not elided to make room", () => {
    // 50 cells holds the lot; nothing should be shortened at all.
    expect(renderAt(50)).toBe("@hh/tent/22467-config-ergonomics-one-slice")
  })

  test("single short segments stay rigid rather than being squeezed", () => {
    // Labels at or below the honest floor cannot be shortened without lying,
    // so they must survive intact wherever the row itself fits.
    expect(renderAt(12, ["a", "bb", "ccc"])).toBe("a/bb/ccc")
  })
})
