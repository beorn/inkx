/**
 * PaneDivider hover-UX contract (bead: divider hover/idle-hidden + bg).
 *
 * The deck wants a divider that is INVISIBLE at rest (bg-only, no glyph) and
 * only reveals a DOTTED sash on hover, together with the col/row-resize pointer
 * shape. A drag keeps the solid accent affordance (no drag-feedback regression).
 *
 * These are the new-prop contract tests required by silvery's "New Props Require
 * Tests" rule (backgroundColor / idleStyle / hover glyphs) exercised through the
 * render pipeline under SILVERY_STRICT=2.
 */

import { EventEmitter } from "node:events"
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import "@termless/test/matchers"
import { Box, PaneDivider, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

/** Mock WriteStream that records raw control writes (OSC 22 lands here). */
function createMockStdout(cols = 24, rows = 6) {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const mock = Object.create(emitter) as NodeJS.WriteStream & { output: string }
  Object.assign(mock, { columns: cols, rows, isTTY: true, writable: true, fd: 1 })
  mock.write = ((data: string | Uint8Array) => {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }) as NodeJS.WriteStream["write"]
  ;(mock as unknown as { end: () => void }).end = () => {}
  ;(mock as unknown as { destroy: () => void }).destroy = () => {}
  return {
    stream: mock as unknown as NodeJS.WriteStream,
    get output() {
      return chunks.join("")
    },
  }
}

/** Mock ReadStream we can push raw input (SGR mouse) bytes into. */
function createMockStdin() {
  const emitter = new EventEmitter()
  const mock = Object.create(emitter) as NodeJS.ReadStream & { push: (s: string) => boolean }
  Object.assign(mock, { isTTY: true, isRaw: false, fd: 0 })
  mock.setRawMode = (() => mock) as NodeJS.ReadStream["setRawMode"]
  ;(mock as unknown as { resume: () => void }).resume = () => {}
  ;(mock as unknown as { pause: () => void }).pause = () => {}
  ;(mock as unknown as { setEncoding: () => void }).setEncoding = () => {}
  mock.on = emitter.on.bind(emitter) as NodeJS.ReadStream["on"]
  mock.off = emitter.off.bind(emitter) as NodeJS.ReadStream["off"]
  mock.once = emitter.once.bind(emitter) as NodeJS.ReadStream["once"]
  mock.emit = emitter.emit.bind(emitter) as NodeJS.ReadStream["emit"]
  mock.removeListener = emitter.removeListener.bind(emitter) as NodeJS.ReadStream["removeListener"]
  mock.addListener = emitter.addListener.bind(emitter) as NodeJS.ReadStream["addListener"]
  mock.push = (s: string) => {
    emitter.emit("data", Buffer.from(s, "utf8"))
    return true
  }
  return mock as NodeJS.ReadStream & { push: (s: string) => boolean }
}

/** SGR motion sequence (button 32 = move-without-press), 1-based coords. */
function sgrMove(x: number, y: number): string {
  return `\x1b[<32;${x + 1};${y + 1}M`
}

describe("PaneDivider hover UX — idle hidden + dotted hover + bg", () => {
  test("idleStyle='hidden' renders NO glyph at rest (bg-only, invisible)", () => {
    const render = createRenderer({ cols: 12, rows: 4 })
    const app = render(
      <Box width={12} height={4} flexDirection="row">
        <PaneDivider
          orientation="vertical"
          idleStyle="hidden"
          backgroundColor="$bg-surface-raised"
        />
        <Text>x</Text>
      </Box>,
    )
    // Idle divider must be a blank cell — no vertical glyph bleeding through.
    for (let row = 0; row < 4; row++) {
      expect(app.cell(0, row).char).not.toBe("│")
      expect(app.cell(0, row).char).not.toBe("┆")
    }
    // The whole first column is the divider; none of it should carry a line glyph.
    expect(app.text).not.toContain("│")
  })

  test("hover reveals a DOTTED vertical sash (┆), not a solid line", async () => {
    using term = createTermless({ cols: 12, rows: 4 })
    const handle = await run(
      <Box width={12} height={4} flexDirection="row">
        <PaneDivider orientation="vertical" idleStyle="hidden" />
        <Text>x</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      // Idle: no glyph anywhere in the divider column. (term.cell is row, col.)
      await waitFor(() => term.screen.getLines().length > 0)
      expect(term.cell(1, 0).char).not.toBe("│")

      await term.mouse.move(0, 1)
      await waitFor(() => term.cell(1, 0).char === "┆")
      expect(term.cell(1, 0).char).toBe("┆")
    } finally {
      handle.unmount()
    }
  })

  test("hover reveals a DOTTED horizontal sash (┄) for horizontal dividers", async () => {
    using term = createTermless({ cols: 12, rows: 4 })
    const handle = await run(
      <Box width={12} height={4} flexDirection="column">
        <PaneDivider orientation="horizontal" idleStyle="hidden" />
        <Text>below</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await waitFor(() => term.screen.getLines().length > 0)
      expect(term.cell(0, 2).char).not.toBe("─")

      await term.mouse.move(2, 0)
      await waitFor(() => term.cell(0, 2).char === "┄")
      expect(term.cell(0, 2).char).toBe("┄")
    } finally {
      handle.unmount()
    }
  })

  test("drag keeps the SOLID accent sash (no drag-feedback regression)", async () => {
    using term = createTermless({ cols: 12, rows: 4 })
    const handle = await run(
      <Box width={12} height={4} flexDirection="row">
        <PaneDivider orientation="vertical" idleStyle="hidden" activeColor="$fg-accent" />
        <Text>x</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    try {
      await waitFor(() => term.screen.getLines().length > 0)
      await term.mouse.down(0, 1)
      // While dragging the sash is SOLID (│), not dotted — the drag affordance.
      await waitFor(() => term.cell(1, 0).char === "│")
      expect(term.cell(1, 0).char).toBe("│")
    } finally {
      await term.mouse.up(0, 1)
      handle.unmount()
    }
  })

  test("backgroundColor paints the divider strip cells", () => {
    const render = createRenderer({ cols: 12, rows: 4 })
    const app = render(
      <Box width={12} height={4} flexDirection="row">
        <PaneDivider
          orientation="vertical"
          idleStyle="hidden"
          backgroundColor="$bg-surface-raised"
        />
        <Text>x</Text>
      </Box>,
    )
    const dividerBg = app.cell(0, 1).bg
    // The strip cell carries a resolved bg (not the null default) so it can match
    // the panes on either side.
    expect(dividerBg).toBeTruthy()
  })

  test("hover emits OSC22 col-resize and resets on leave", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(
      <Box width={12} height={4} flexDirection="row">
        <PaneDivider orientation="vertical" idleStyle="hidden" />
        <Text>x</Text>
      </Box>,
      {
        stdout: stdout.stream,
        stdin,
        cols: 12,
        rows: 4,
        kitty: false,
        focusReporting: false,
      } as never,
    )
    try {
      // Hover the 1-cell sash at col 0 → col/row-resize cursor.
      stdin.push(sgrMove(0, 1))
      await waitFor(() => stdout.output.includes("\x1b]22;col-resize\x07"))
      expect(stdout.output).toContain("\x1b]22;col-resize\x07")

      // Move off the sash → cursor resets to default.
      stdin.push(sgrMove(6, 1))
      await waitFor(() => stdout.output.includes("\x1b]22;default\x07"))
      expect(stdout.output).toContain("\x1b]22;default\x07")
    } finally {
      handle.unmount()
    }
  })

  test("horizontal divider requests the row-resize cursor on hover", async () => {
    const stdout = createMockStdout()
    const stdin = createMockStdin()
    const handle = await run(
      <Box width={12} height={4} flexDirection="column">
        <PaneDivider orientation="horizontal" idleStyle="hidden" />
        <Text>below</Text>
      </Box>,
      {
        stdout: stdout.stream,
        stdin,
        cols: 12,
        rows: 4,
        kitty: false,
        focusReporting: false,
      } as never,
    )
    try {
      stdin.push(sgrMove(2, 0))
      await waitFor(() => stdout.output.includes("\x1b]22;row-resize\x07"))
      expect(stdout.output).toContain("\x1b]22;row-resize\x07")
    } finally {
      handle.unmount()
    }
  })
})
