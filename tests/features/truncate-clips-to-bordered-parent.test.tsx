/**
 * A `wrap="truncate"` Text must clip to its bordered parent's inner width on
 * BOTH flex axes.
 *
 * Bead: km-silvery.text-intrinsic-vs-render.
 *
 * The defect: as a direct child of a COLUMN container the Text kept its full
 * natural width, painted straight over the parent's right border, and was cut
 * by the terminal edge instead. Operator hit it 2026-08-13 on the yrd `watch`
 * RUNNER box — `uncarried 41 of 4784 refs, …` ate the border and lost its
 * trailing `as of 4m ago` clause, the half that makes the count trustworthy.
 * The same Text inside a ROW was fine, which is what made it look cosmetic.
 *
 * Root cause was the measureFunc answering a DEFINITE width budget with
 * intrinsic (natural) width. On the MAIN axis flexbox rescues that: the engine
 * also asks a min-content query, which non-wrappable text answers with 1, so
 * flex-shrink pulls the item back inside. On the CROSS axis no min-content
 * query is ever issued, nothing shrinks, and natural width becomes the used
 * width. Hence row-passes / column-fails.
 *
 * These assert rendered CHARACTERS and the border column, not just the width
 * number — the defect is visible paint escaping a frame, and a width-only
 * assertion would pass on a renderer that still overprinted the border.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "silvery"
import { createRenderer } from "@silvery/test"

// Wider than the 22-cell inner width below, with a trailing clause that must
// visibly go missing (not silently ride past the frame) when truncated.
const LONG = "uncarried 41 of 4784 refs, 12 stale, as of 4m ago"

const BOX_WIDTH = 24
const INNER_WIDTH = BOX_WIDTH - 2

function renderBoxed(direction: "row" | "column", wrap: "truncate" | "clip") {
  const render = createRenderer({ cols: 60, rows: 6 })
  return render(
    <Box width={BOX_WIDTH} borderStyle="round" flexDirection={direction}>
      <Text wrap={wrap}>{LONG}</Text>
    </Box>,
  )
}

describe("truncate clips to the bordered parent on both axes", () => {
  for (const direction of ["column", "row"] as const) {
    test(`${direction}: every content row is exactly the border width`, () => {
      const app = renderBoxed(direction, "truncate")
      const lines = app.text.split("\n").filter((line) => line.length > 0)

      // No line may exceed the frame — the escaping row was 49 cells wide.
      for (const line of lines) {
        expect(line.length, `line escaped the frame: ${JSON.stringify(line)}`).toBe(BOX_WIDTH)
      }
    })

    test(`${direction}: the right border survives on the text row`, () => {
      const app = renderBoxed(direction, "truncate")
      const textRow = app.text.split("\n").find((line) => line.includes("uncarried"))
      expect(textRow).toBeDefined()
      // Left and right frame cells intact, content strictly between them.
      expect(textRow!.at(0)).toBe("│")
      expect(textRow!.at(BOX_WIDTH - 1)).toBe("│")
    })

    test(`${direction}: content is truncated with an ellipsis, not overflowed`, () => {
      const app = renderBoxed(direction, "truncate")
      // The tail clause is dropped, and U+2026 makes that loss visible rather
      // than letting the text silently run past the border.
      expect(app.text).not.toContain("as of 4m ago")
      expect(app.text).toContain("…")
    })

    test(`${direction}: wrap="clip" also stays inside the frame, with no ellipsis`, () => {
      const app = renderBoxed(direction, "clip")
      const textRow = app.text.split("\n").find((line) => line.includes("uncarried"))
      expect(textRow).toBeDefined()
      expect(textRow!.length).toBe(BOX_WIDTH)
      expect(textRow!.at(BOX_WIDTH - 1)).toBe("│")
      // Chrome is clipped, prose is truncated — clip loses content silently.
      expect(textRow).not.toContain("…")
    })
  }

  test("an unconstrained parent still shrink-wraps to full natural width", () => {
    // The clamp must bite only on a DEFINITE budget. With no width on the
    // parent the measureFunc is queried unconstrained (max-content), so the
    // full string must survive — otherwise the fix would have broken
    // shrink-wrap sizing everywhere.
    const render = createRenderer({ cols: 80, rows: 6 })
    const app = render(
      <Box borderStyle="round" flexDirection="column">
        <Text wrap="truncate">{LONG}</Text>
      </Box>,
    )
    expect(app.text).toContain(LONG)
    expect(app.text).not.toContain("…")
  })

  test("a column child narrower than its budget is not stretched", () => {
    // Guards the other direction: clamping is a max, never a min.
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(
      <Box width={BOX_WIDTH} borderStyle="round" flexDirection="column">
        <Text wrap="truncate">short</Text>
      </Box>,
    )
    const textRow = app.text.split("\n").find((line) => line.includes("short"))
    expect(textRow).toBeDefined()
    expect(textRow!.length).toBe(BOX_WIDTH)
    expect(textRow!.at(BOX_WIDTH - 1)).toBe("│")
  })

  test("nested columns clip at the innermost budget", () => {
    // The yrd RUNNER box shape: a titled outer frame with an inner column of
    // prose rails. The rail must clip to the INNER content box.
    const render = createRenderer({ cols: 60, rows: 8 })
    const app = render(
      <Box width={30} borderStyle="round" flexDirection="column" padding={1}>
        <Box flexDirection="column">
          <Text wrap="truncate">{LONG}</Text>
        </Box>
      </Box>,
    )
    for (const line of app.text.split("\n").filter((line) => line.length > 0)) {
      expect(line.length).toBe(30)
    }
    expect(app.text).not.toContain("as of 4m ago")
  })
})

describe("truncate keeps the layout width it was given", () => {
  test("column child is laid out at the inner width, not natural width", () => {
    // The width number behind the paint: 22 (inner), never 49 (natural).
    const app = renderBoxed("column", "truncate")
    const root = (app as unknown as { getContainer: () => { children: unknown[] } }).getContainer()
    const box = (root.children as { children: { boxRect: { width: number } | null }[] }[])[0]
    expect(box!.children[0]!.boxRect?.width).toBe(INNER_WIDTH)
  })
})
