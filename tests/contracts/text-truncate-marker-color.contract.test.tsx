/**
 * `TextProps.truncateMarkerColor` — defaults contract.
 *
 * Bead: 19788 follow-up (km @km/inbox/19788-km-f330).
 *
 * Contract verified here:
 *   - Omitting `truncateMarkerColor` styles the inserted elision marker with
 *     the documented `@default "$muted"` — i.e. the marker cell's fg resolves
 *     to a real (non-null) color that DIFFERS from the surrounding text color.
 *
 * Why this contract exists: every existing truncate test sets the text color
 * but not `truncateMarkerColor`, so the muted-default path is only ever the
 * DEFAULT path. Without an explicit omit-the-prop assertion, the docstring
 * (`@default "$muted"`) and code drift silently — the exact failure shape the
 * defaults-contract convention exists to catch (see tests/contracts/README.md).
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"

const CMD = "git commit --message 'a very long commit message here' --no-verify"

describe("contract: truncateMarkerColor defaults to $muted", () => {
  test("omitting truncateMarkerColor styles the ellipsis muted (≠ text color)", () => {
    const WIDTH = 30
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          {/* truncateMarkerColor OMITTED — must resolve to "$muted". */}
          <Text color="#ffffff" wrap="truncate-middle">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)

    const ellipsisCol = app.lines[0]!.indexOf("…")
    expect(ellipsisCol).toBeGreaterThan(0)

    const textFg = app.cell(0, 0).fg
    const markerFg = app.cell(ellipsisCol, 0).fg
    // Surrounding text is the explicit #ffffff.
    expect(textFg).toEqual({ r: 255, g: 255, b: 255 })
    // The default-muted marker is a real color, and it is NOT the text color —
    // proving the `@default "$muted"` path resolved to a concrete token value.
    expect(markerFg).not.toBeNull()
    expect(markerFg).not.toEqual(textFg)
  })

  test("default muted marker carries a different color than an explicit override", () => {
    const WIDTH = 30
    function App({ marker }: { marker?: string }) {
      return (
        <Box width={WIDTH} height={1}>
          <Text color="#ffffff" truncateMarkerColor={marker} wrap="truncate-middle">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })

    const def = render(<App />)
    const defCol = def.lines[0]!.indexOf("…")
    const defaultMarkerFg = def.cell(defCol, 0).fg

    const explicit = render(<App marker="#ff0000" />)
    const expCol = explicit.lines[0]!.indexOf("…")
    expect(explicit.cell(expCol, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    // The default muted color is not the explicit red (sanity: default is real,
    // distinct, and overridable).
    expect(defaultMarkerFg).not.toEqual({ r: 255, g: 0, b: 0 })
  })
})
