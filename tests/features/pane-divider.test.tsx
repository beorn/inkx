import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import { Box, PaneDivider, Text, type PaneDividerResizeStartEvent } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

describe("PaneDivider", () => {
  test("renders vertical and horizontal pane divider glyphs", () => {
    const render = createRenderer({ cols: 16, rows: 6 })

    const vertical = render(
      <Box width={16} height={6} flexDirection="row">
        <PaneDivider orientation="vertical" />
        <Text>right</Text>
      </Box>,
    )
    expect(vertical.text).toContain("│")

    const horizontal = render(
      <Box width={16} height={6} flexDirection="column">
        <PaneDivider orientation="horizontal" />
        <Text>below</Text>
      </Box>,
    )
    expect(horizontal.text).toContain("─")
  })

  test("hover arms the divider affordance without changing layout", async () => {
    using term = createTermless({ cols: 16, rows: 6 })
    const handle = await run(
      <Box width={16} height={6} flexDirection="row">
        <PaneDivider orientation="vertical" color="$fg-muted" activeColor="$fg-accent" />
        <Text>right</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await waitFor(() => term.cell(1, 0).char === "│")
      const idleFg = term.cell(1, 0).fg

      await term.mouse.move(0, 1)
      await waitFor(() => term.cell(1, 0).fg !== idleFg)

      expect(term.cell(1, 0).char).toBe("│")
      expect(term.cell(0, 1).char).toBe("r")
    } finally {
      handle.unmount()
    }
  })

  test("reports the resize-start coordinate on mousedown", async () => {
    using term = createTermless({ cols: 16, rows: 6 })
    const starts: PaneDividerResizeStartEvent[] = []
    const onResizeStart = vi.fn((event: PaneDividerResizeStartEvent) => {
      starts.push(event)
    })
    const handle = await run(
      <Box width={16} height={6} flexDirection="column">
        <PaneDivider orientation="horizontal" onResizeStart={onResizeStart} />
        <Text>below</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await term.mouse.down(2, 0)
      await waitFor(() => starts.length === 1)

      expect(onResizeStart).toHaveBeenCalledTimes(1)
      expect(starts[0]).toMatchObject({
        orientation: "horizontal",
        coordinate: 0,
        x: 2,
        y: 0,
      })
    } finally {
      await term.mouse.up(2, 0)
      handle.unmount()
    }
  })
})
