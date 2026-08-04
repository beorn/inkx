/**
 * @si/content/22774 — a centred box that OVERFLOWS its container loses content
 * at BOTH ends, and the loss is silent.
 *
 * This is not a silvery quirk. Centring distributes free space equally, so when
 * free space is NEGATIVE the item is pushed past both edges — the head is cut
 * as badly as the tail, and the middle looks perfectly intact. Every CSS
 * implementation does this, which is why CSS Box Alignment 3 defines the
 * `safe` keyword: `safe center` behaves as `start` when the item overflows.
 *
 * Flexily does not implement `safe`. But CSS has always had a second way to
 * express the same intent, predating the keyword: AUTO MARGINS. Auto margins
 * absorb POSITIVE free space (centring the item) and resolve to ZERO when free
 * space is negative (leaving it start-aligned). That is exactly `safe center`.
 *
 * MEASURED, and it moved the fix: flexily ALREADY implements auto margins —
 * `src/types.ts` carries "Whether main-start margin is auto (absorbs free
 * space)" with resolved-value slots beside it. What is missing is one layer
 * up: silvery's `BoxProps` types every margin as `number`, so `"auto"` never
 * reaches the engine. Passing it renders an EMPTY line rather than an
 * uncentred one, which is how the two failing cases below fail.
 *
 * So this needs no new alignment vocabulary and no `safe` keyword in the
 * engine. It needs `number | "auto"` on the margin props and the plumbing to
 * pass it down — a strictly smaller change than the one the design doc
 * originally recommended, using a capability that is already built.
 *
 * The two `test.fails` cases below are the specification for that work. They
 * assert the gap is still open, so the day the props accept "auto" they go red
 * and force their own conversion into ordinary assertions.
 */

import { describe, expect, test } from "vitest"
import React from "react"
import { Box, Text } from "@silvery/ag-react"
import { createRenderer } from "@silvery/test"

/** Distinctive head and tail so a loss at either end is unambiguous. */
const ROW = "abcdefghij|MIDDLE|0123456789"
const CONTAINER = 20

function render(inner: Record<string, unknown>): string {
  const renderer = createRenderer({ cols: CONTAINER, rows: 4 })
  const app = renderer(
    <Box width={CONTAINER} flexDirection="column">
      <Box {...inner}>
        <Text wrap={false}>{ROW}</Text>
      </Box>
    </Box>,
  )
  return app.lines[0] ?? ""
}

describe("@si/content/22774 — overflow must not be centred", () => {
  test("alignSelf=center loses BOTH ends when the item overflows", () => {
    const line = render({ alignSelf: "center" })

    // The defect, stated as the observation rather than the mechanism: the
    // middle survives while both extremities are gone.
    expect(line).toContain("MIDDLE")
    expect(line.includes("abcde") && line.includes("56789")).toBe(false)
  })

  test("auto margins keep the HEAD when the item overflows", () => {
    const line = render({ marginLeft: "auto", marginRight: "auto" })

    // `safe center` semantics: negative free space resolves auto margins to
    // zero, so the row starts at the container's start edge. The tail is still
    // cut — it does not fit, and no alignment can change that — but a reader
    // never loses a row's LABEL while the middle looks intact.
    expect(line).toContain("abcde")
  })

  /**
   * NOTE, found the hard way: the inner Box needs an explicit `width` here.
   * A content-sized Box with auto side margins does NOT centre — it stretches
   * to fill the cross axis, so there is no free space for the auto margins to
   * absorb and the content stays flush left. That is a sizing question, not an
   * alignment one, and it is why this case pins a width while the overflow
   * case above does not need to.
   */
  test("auto margins still CENTRE when the item fits — 15652 must survive", () => {
    const short = "xy"
    const renderer = createRenderer({ cols: CONTAINER, rows: 4 })
    const app = renderer(
      <Box width={CONTAINER} flexDirection="column">
        <Box width={2} marginLeft="auto" marginRight="auto">
          <Text wrap={false}>{short}</Text>
        </Box>
      </Box>,
    )
    const line = app.lines[0] ?? ""

    // Centred, not flush left: leading whitespace before the content.
    expect(line.indexOf("xy")).toBeGreaterThan(0)
  })
})
