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
 * SessionCard, SidePanel, and SessionPromptComposer roots each set
 * `userSelect="contain"` to define those boundaries.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { Box, Text } from "silvery"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import type { Term } from "silvery"
import "@termless/test/matchers"
import type { MessageEntry, MessageOp } from "@km/agent-harness"
import { Content } from "../src/components/Content.tsx"
import { SessionUpdateList } from "../src/components/SessionUpdateList.tsx"

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

function pixelMouse(term: Term, button: number, clientX: number, clientY: number, up = false) {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(
    `\x1b[<${button};${clientX + 1};${clientY + 1}${up ? "m" : "M"}`,
  )
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

function DocumentSelectionShape(): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Box width={20} height={3} flexDirection="column">
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
        <Text>LLLLLLLLLLLLLLLLLLL</Text>
      </Box>
      <Box width={20} height={3} flexDirection="column">
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
        <Text>RRRRRRRRRRRRRRRRRRR</Text>
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

function message(id: string, text: string): MessageEntry {
  const ops: MessageOp[] = [{ kind: "text", text }]
  return {
    id,
    role: "assistant",
    ops,
    text,
    toolCalls: [],
    toolResults: [],
    ts: Date.UTC(2026, 4, 5, 12, 0),
  } as unknown as MessageEntry
}

describe("silvercode: drag selection is scoped to the origin surface", () => {
  test("SGR-Pixels drag-select works in the transcript ListView", async () => {
    using term = createTermless({ cols: 100, rows: 18 })
    const target = "Another selectable transcript line near the bottom."
    const handle = await run(
      <Box width={100} height={18} flexDirection="column">
        <Content.Layout>
          <SessionUpdateList
            messages={[message("a1", "This is selectable transcript text."), message("a2", target)]}
            status="idle"
            turnStartedAt={null}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
            sessionId="selection-test"
            onApprove={() => {}}
            onDeny={() => {}}
            follow="end"
            paddingTop={1}
            paddingBottom={1}
            viewportBottomInset={4}
          />
        </Content.Layout>
      </Box>,
      term,
      { mouse: { coordinateMode: "pixel", cellSize: { width: 10, height: 20 } } },
    )
    await settle()
    term.clipboard.clear()

    const found = (term as unknown as { find(text: string): { row: number; col: number } | null }).find(
      "Another selectable",
    )
    expect(found).not.toBeNull()
    if (!found) throw new Error("transcript text did not render")

    const y = found.row * 20 + 10
    pixelMouse(term, 0, found.col * 10 + 5, y)
    await settle(50)
    pixelMouse(term, 32, (found.col + 30) * 10 + 5, y)
    await settle(50)
    pixelMouse(term, 0, (found.col + 30) * 10 + 5, y, true)
    await settle(200)

    expect(term.clipboard.last).toBe(target.slice(0, 31))

    handle.unmount()
  })

  test("default document selection uses the smallest common node, not the raw buffer row", async () => {
    using term = createTermless({ cols: 60, rows: 8 })
    const chunks: string[] = []
    const emulator = (term as unknown as { _emulator: { feed: (s: string) => void } })._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      chunks.push(data)
      origFeed(data)
    }

    const handle = await run(<DocumentSelectionShape />, term, { selection: true, mouse: true } as never)
    await settle()
    chunks.length = 0

    // Start and end inside the left document node over multiple rows. Raw
    // buffer selection would include the right sibling on the first row.
    mouseDown(term, 2, 0)
    await settle(80)
    mouseMove(term, 10, 1)
    await settle(80)
    mouseUp(term, 10, 1)
    await settle(300)

    const decoded = decodeLastOsc52(chunks)
    expect(decoded).not.toBeNull()
    expect(decoded).toMatch(/L/)
    expect(decoded).not.toMatch(/R/)

    handle.unmount()
  })

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
