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

  // Acceptance #2 (@si/render/20517): a dialog/popup overlapping an unfocused
  // pane keeps its own bg/fg. Mirrors silvery's ModalOverlay shape — a
  // full-screen TRANSPARENT absolute wrapper holding an OPAQUE dialog body. The
  // opaque body (outside the faded pane's AgNode tree) stays crisp; the pane
  // still fades where the transparent wrapper crosses it (the wrapper paints
  // nothing, so it does NOT un-fade the pane behind it).
  test("a bg-bearing dialog crossing a faded pane keeps its own bg/fg; the pane stays faded around it", () => {
    const render = createRenderer({ cols: 30, rows: 4 })
    const app = render(
      <Box backgroundColor="#000000" width={30} height={4}>
        <Box width={14} height={4} data-subtree-fade={0.5} flexDirection="column">
          <Text color="#FFFFFF">pane one</Text>
          <Text color="#FFFFFF">pane two</Text>
          <Text color="#FFFFFF">pane three</Text>
        </Box>
        <Box position="absolute" top={0} left={0} width="100%" height="100%">
          {/* Opaque dialog body positioned over the faded pane. */}
          <Box position="absolute" top={1} left={2} backgroundColor="#202020" flexShrink={0}>
            <Text color="#00FF00">DLG</Text>
          </Box>
        </Box>
      </Box>,
    )

    // The opaque dialog body keeps its own fg AND bg — excluded from the fade.
    const dlg = app.cell(2, 1)
    expect(dlg.char).toBe("D")
    expect(dlg.fg).toEqual({ r: 0, g: 255, b: 0 })
    expect(dlg.bg).toEqual({ r: 32, g: 32, b: 32 })

    // The pane stays faded where only the TRANSPARENT wrapper crosses it (row 0,
    // outside the dialog body) — the wrapper paints nothing so it is not an
    // exclude.
    const paneCell = app.cell(0, 0)
    expect(paneCell.char).toBe("p")
    expect(paneCell.fg).not.toEqual({ r: 255, g: 255, b: 255 })
  })

  // The post-content carry-forward invariant (@si/render/20517): a dimmed pane's
  // fade must not compound across incremental frames when an UNRELATED sibling
  // changes (the dimmed pane fast-path skips, keeping the pre-fade clone).
  // SILVERY_STRICT auto-verifies incremental == fresh on each rerender.
  test("incremental: a dimmed pane's fade does not compound when a sibling changes", () => {
    const render = createRenderer({ cols: 30, rows: 3 })
    function App({ n }: { n: number }) {
      return (
        <Box backgroundColor="#000000" width={30} height={3} flexDirection="row">
          <Box width={14} height={3} data-subtree-fade={0.5} flexDirection="column">
            <Text color="#FFFFFF">left pane</Text>
          </Box>
          <Box width={16} height={3} flexDirection="column">
            <Text color="#FFFFFF">count {n}</Text>
          </Box>
        </Box>
      )
    }
    const app = render(<App n={0} />)
    const fadedFirst = fgKey(app.cell(0, 0))
    expect(fadedFirst).not.toBe(JSON.stringify({ r: 255, g: 255, b: 255 }))
    for (let n = 1; n <= 5; n++) {
      app.rerender(<App n={n} />)
      expect(app.cell(0, 0).char).toBe("l")
      // Single, stable fade — never darker than the first frame's single fade.
      expect(fgKey(app.cell(0, 0))).toBe(fadedFirst)
    }
  })

  // Two tiled dimmed panes both fade — each cell exactly once (dedup across
  // include rects). A pane on each side, a crisp focused divider between.
  test("two dimmed panes both fade once; nothing double-dims", () => {
    const render = createRenderer({ cols: 30, rows: 2 })
    const app = render(
      <Box backgroundColor="#000000" width={30} height={2} flexDirection="row">
        <Box width={14} height={2} data-subtree-fade={0.5}>
          <Text color="#FFFFFF">left</Text>
        </Box>
        <Box width={2} height={2}>
          <Text color="#FFFFFF">|</Text>
        </Box>
        <Box width={14} height={2} data-subtree-fade={0.5}>
          <Text color="#FFFFFF">right</Text>
        </Box>
      </Box>,
    )
    const left = fgKey(app.cell(0, 0))
    const right = fgKey(app.cell(16, 0))
    expect(left).not.toBe(JSON.stringify({ r: 255, g: 255, b: 255 }))
    // Both dimmed panes fade by the same single amount → identical fg.
    expect(right).toBe(left)
  })
})
