/**
 * Regression: mouse-drag selection must be SCOPED to the surface where
 * the drag started. A drag that begins inside a SessionCard must not
 * extend into a neighbor card, into the side panel, or into the command
 * box — and vice versa.
 *
 * Silvery supports this via `userSelect="contain"` (CSS analog). When
 * the drag head would land outside the contain ancestor's scrollRect,
 * silvery's findContainBoundary clamps the selection head to the
 * ancestor's bounds. This test verifies the plumbing works by dragging
 * from inside one region into another and asserting the clipboard
 * payload contains ONLY content from the origin region.
 *
 * SessionCard, SidePanel, and CommandBox roots each set
 * `userSelect="contain"` to define those boundaries.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "silvery"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import type { Term } from "silvery/runtime"
import "@termless/test/matchers"

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms))

function mouseDown(term: Term, x: number, y: number) {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(`\x1b[<0;${x + 1};${y + 1}M`)
}
function mouseMove(term: Term, x: number, y: number) {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(`\x1b[<32;${x + 1};${y + 1}M`)
}
function mouseUp(term: Term, x: number, y: number) {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(`\x1b[<0;${x + 1};${y + 1}m`)
}

// Layout that mirrors silvercode's App.tsx shape:
//   [ cardLeft (userSelect=contain) | cardRight (userSelect=contain) | sidePanel (userSelect=contain) ]
// Card contents are distinct sentinel chars (L / R / S) so the clipboard
// payload reveals cross-boundary leakage.
function SilvercodeShape(): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Box userSelect="contain" width={20} height={5} flexDirection="column">
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
      </Box>
      <Box userSelect="contain" width={20} height={5} flexDirection="column">
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
      </Box>
      <Box userSelect="contain" width={20} height={5} flexDirection="column">
        <Text>SSSSSSSSSSSSSSSSSSS</Text>
        <Text>SSSSSSSSSSSSSSSSSSS</Text>
        <Text>SSSSSSSSSSSSSSSSSSS</Text>
        <Text>SSSSSSSSSSSSSSSSSSS</Text>
        <Text>SSSSSSSSSSSSSSSSSSS</Text>
      </Box>
    </Box>
  )
}

function decodeLastOsc52(chunks: string[]): string | null {
  const osc = chunks.findLast((s) => s.includes("\x1b]52;c;"))
  if (!osc) return null
  const match = osc.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
  if (!match) return null
  return Buffer.from(match[1]!, "base64").toString("utf-8")
}

describe("silvercode: drag selection is scoped to the origin surface", () => {
  test("drag from left card into right card selects only L content", async () => {
    using term = createTermless({ cols: 80, rows: 10 })
    const chunks: string[] = []
    const emulator = (term as unknown as { _emulator: { feed: (s: string) => void } })._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      chunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SilvercodeShape />, term, { selection: true, mouse: true } as never)
    await settle()
    expect(term.screen).toContainText("LLLLLLLLL")
    expect(term.screen).toContainText("RRRRRRRRR")
    expect(term.screen).toContainText("SSSSSSSSS")
    chunks.length = 0

    // Drag from inside left card (col=2) into right card (col=30).
    mouseDown(term, 2, 1)
    await settle(80)
    mouseMove(term, 30, 2)
    await settle(80)
    mouseUp(term, 30, 2)
    await settle(300)

    const decoded = decodeLastOsc52(chunks)
    expect(decoded).not.toBeNull()
    expect(decoded).toMatch(/L/)
    expect(decoded).not.toMatch(/R/)
    expect(decoded).not.toMatch(/S/)

    handle.unmount()
  })

  test("drag from right card into side panel selects only R content", async () => {
    using term = createTermless({ cols: 80, rows: 10 })
    const chunks: string[] = []
    const emulator = (term as unknown as { _emulator: { feed: (s: string) => void } })._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      chunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SilvercodeShape />, term, { selection: true, mouse: true } as never)
    await settle()
    chunks.length = 0

    // Drag from inside right card (col=22) into side panel (col=50).
    mouseDown(term, 22, 1)
    await settle(80)
    mouseMove(term, 50, 2)
    await settle(80)
    mouseUp(term, 50, 2)
    await settle(300)

    const decoded = decodeLastOsc52(chunks)
    expect(decoded).not.toBeNull()
    expect(decoded).toMatch(/R/)
    expect(decoded).not.toMatch(/L/)
    expect(decoded).not.toMatch(/S/)

    handle.unmount()
  })

  test("drag from side panel into card selects only S content", async () => {
    using term = createTermless({ cols: 80, rows: 10 })
    const chunks: string[] = []
    const emulator = (term as unknown as { _emulator: { feed: (s: string) => void } })._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      chunks.push(data)
      origFeed(data)
    }

    const handle = await run(<SilvercodeShape />, term, { selection: true, mouse: true } as never)
    await settle()
    chunks.length = 0

    // Drag from inside side panel (col=42) leftward into cards (col=5).
    mouseDown(term, 42, 1)
    await settle(80)
    mouseMove(term, 5, 2)
    await settle(80)
    mouseUp(term, 5, 2)
    await settle(300)

    const decoded = decodeLastOsc52(chunks)
    expect(decoded).not.toBeNull()
    expect(decoded).toMatch(/S/)
    expect(decoded).not.toMatch(/R/)
    expect(decoded).not.toMatch(/L/)

    handle.unmount()
  })
})
