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

  test("absolute-layout vertical hitbox spans the divider height", async () => {
    using term = createTermless({ cols: 16, rows: 6 })
    const starts: PaneDividerResizeStartEvent[] = []
    const onResizeStart = vi.fn((event: PaneDividerResizeStartEvent) => {
      starts.push(event)
    })
    const handle = await run(
      <Box width={16} height={6} position="relative">
        <Box position="absolute" top={0} left={3} width={1} height="100%">
          <PaneDivider orientation="vertical" onResizeStart={onResizeStart} />
        </Box>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await term.mouse.down(3, 5)
      await waitFor(() => starts.length === 1)

      expect(starts[0]).toMatchObject({ orientation: "vertical", coordinate: 3, x: 3, y: 5 })
    } finally {
      await term.mouse.up(3, 5)
      handle.unmount()
    }
  })

  test("absolute-layout horizontal hitbox spans the divider width", async () => {
    using term = createTermless({ cols: 16, rows: 6 })
    const starts: PaneDividerResizeStartEvent[] = []
    const onResizeStart = vi.fn((event: PaneDividerResizeStartEvent) => {
      starts.push(event)
    })
    const handle = await run(
      <Box width={16} height={6} position="relative">
        <Box position="absolute" top={4} left={0} width="100%" height={1}>
          <PaneDivider orientation="horizontal" onResizeStart={onResizeStart} />
        </Box>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await term.mouse.down(12, 4)
      await waitFor(() => starts.length === 1)

      expect(starts[0]).toMatchObject({ orientation: "horizontal", coordinate: 4, x: 12, y: 4 })
    } finally {
      await term.mouse.up(12, 4)
      handle.unmount()
    }
  })

  test("tracks move + end through a captured drag (onResizeMove / onResizeEnd)", async () => {
    using term = createTermless({ cols: 16, rows: 6 })
    const moves: number[] = []
    const onResizeStart = vi.fn()
    const onResizeMove = vi.fn((c: number) => moves.push(c))
    const onResizeEnd = vi.fn()
    const handle = await run(
      <Box width={16} height={6} flexDirection="row">
        <PaneDivider
          orientation="vertical"
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
        />
        <Text>right</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      // Press on the one-cell sash at col 0…
      await term.mouse.down(0, 1)
      await waitFor(() => onResizeStart.mock.calls.length === 1)
      // …then move the cursor OFF the sash (cols 5, 9). mouseCapture routes those
      // moves back to the divider, so the parent still tracks the gesture.
      await term.mouse.move(5, 1)
      await term.mouse.move(9, 1)
      await waitFor(() => moves.length >= 1)
      await term.mouse.up(9, 1)
      await waitFor(() => onResizeEnd.mock.calls.length === 1)

      expect(onResizeStart).toHaveBeenCalledTimes(1)
      expect(moves.some((c) => c >= 5)).toBe(true) // captured coordinate followed the cursor off the sash
      expect(onResizeEnd).toHaveBeenCalledTimes(1)
    } finally {
      handle.unmount()
    }
  })
})
