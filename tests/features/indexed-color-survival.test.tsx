/**
 * Indexed-color survival — palette provenance must reach both render legs.
 *
 * A cell whose color originated from a 256-color palette slot must emit indexed
 * SGR (`38;5;N` / `48;5;N`) on the outer-terminal write leg, and must expose the
 * originating `index` on the FrameCell read leg — never a truecolor bake
 * (`38;2;r;g;b`) or a bare RGB that has lost its palette identity.
 *
 * This is the silvery half of the D3 render-plane convergence (terminal-flow
 * vertical slice §7 row D3): silvery's render Color shape is structurally
 * compatible with termless's `Color = { r, g, b, index? }` — painters read
 * r/g/b unconditionally, only identity-aware code touches `index`.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { TerminalBuffer, createTextFrame } from "@silvery/ag-term/buffer"

describe("indexed color survival", () => {
  test("write leg: ansi256(N) string tokens emit indexed SGR, not truecolor", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box>
        <Text color="ansi256(196)" backgroundColor="ansi256(21)">
          HI
        </Text>
      </Box>,
    )
    expect(app.ansi).toContain("38;5;196")
    expect(app.ansi).toContain("48;5;21")
    expect(app.ansi).not.toContain("38;2;")
    expect(app.ansi).not.toContain("48;2;")
  })

  test("read leg: FrameCell preserves the palette index alongside resolved RGB", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box>
        <Text color="ansi256(196)" backgroundColor="ansi256(21)">
          HI
        </Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    // RGB is still resolved (painters read it unconditionally)...
    expect(cell.fg).toMatchObject({ r: 255, g: 0, b: 0 })
    // ...and the palette provenance survives.
    expect(cell.fg?.index).toBe(196)
    expect(cell.bg?.index).toBe(21)
  })

  test("read leg: truecolor cells carry no index", () => {
    const render = createRenderer({ cols: 20, rows: 3 })
    const app = render(
      <Box>
        <Text color="#ff8800">X</Text>
      </Box>,
    )
    const cell = app.cell(0, 0)
    expect(cell.fg).toMatchObject({ r: 255, g: 136, b: 0 })
    expect(cell.fg?.index).toBeUndefined()
  })

  test("write leg: an index-bearing RGB object packs + emits as indexed", () => {
    // This is the shape the vterm guest produces post-pin-bump: identity CellColor
    // = flat rgb + optional palette `index`. Silvery must not bake it to truecolor.
    const buf = new TerminalBuffer(4, 1)
    buf.setCell(0, 0, {
      char: "A",
      fg: { r: 255, g: 0, b: 0, index: 196 },
      bg: { r: 0, g: 0, b: 255, index: 21 },
    })
    const frame = createTextFrame(buf)
    expect(frame.ansi).toContain("38;5;196")
    expect(frame.ansi).toContain("48;5;21")
    expect(frame.ansi).not.toContain("38;2;")
    expect(frame.ansi).not.toContain("48;2;")

    // ...and the read leg exposes the index too.
    const cell = frame.cell(0, 0)
    expect(cell.fg?.index).toBe(196)
    expect(cell.bg?.index).toBe(21)
  })

  test("write leg: an index-bearing object equals the bare-number form (no spurious diff)", () => {
    const objBuf = new TerminalBuffer(4, 1)
    objBuf.setCell(0, 0, { char: "A", fg: { r: 255, g: 0, b: 0, index: 196 } })
    const numBuf = new TerminalBuffer(4, 1)
    numBuf.setCell(0, 0, { char: "A", fg: 196 })
    // Same palette slot ⇒ identical packed cell ⇒ no output diff.
    expect(objBuf.cellEquals(0, 0, numBuf)).toBe(true)
  })
})
