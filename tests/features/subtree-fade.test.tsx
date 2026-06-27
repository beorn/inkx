import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

function fgKey(cell: { fg: { r: number; g: number; b: number } | null }): string {
  return JSON.stringify(cell.fg)
}

function expectWhite(cell: { fg: { r: number; g: number; b: number } | null }): void {
  expect(cell.fg).toEqual({ r: 255, g: 255, b: 255 })
}

describe("render-phase subtree fade", () => {
  test("fades only the marked subtree, not a later sibling overlay crossing its rect", () => {
    const render = createRenderer({ cols: 24, rows: 3 })

    const app = render(
      <Box backgroundColor="#000000" width={24} height={3}>
        <Box width={14} height={1} data-subtree-fade={0.5}>
          <Text color="#FFFFFF">faded content</Text>
        </Box>
        <Box position="absolute" top={0} left={5}>
          <Text color="#FFFFFF">OVERLAY</Text>
        </Box>
      </Box>,
    )

    const faded = app.cell(0, 0)
    expect(faded.char).toBe("f")
    expect(faded.fg).not.toEqual({ r: 255, g: 255, b: 255 })

    const overlay = app.cell(5, 0)
    expect(overlay.char).toBe("O")
    expectWhite(overlay)
  })

  test("does not compound when faded descendants repaint, and removal restores crisp cells", () => {
    const render = createRenderer({ cols: 20, rows: 3 })

    function App({ faded, label }: { faded: boolean; label: string }) {
      return (
        <Box backgroundColor="#000000" width={20} height={3}>
          <Box data-subtree-fade={faded ? 0.5 : 0}>
            <Text color="#FFFFFF">{label}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App faded={true} label="AAAA" />)
    const firstFade = fgKey(app.cell(0, 0))
    expect(firstFade).not.toBe(JSON.stringify({ r: 255, g: 255, b: 255 }))

    app.rerender(<App faded={true} label="BBBB" />)
    expect(app.cell(0, 0).char).toBe("B")
    expect(fgKey(app.cell(0, 0))).toBe(firstFade)

    app.rerender(<App faded={false} label="CCCC" />)
    expect(app.cell(0, 0).char).toBe("C")
    expectWhite(app.cell(0, 0))
  })
})
