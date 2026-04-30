import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import type { Term } from "silvery"
import "@termless/test/matchers"
import { StorybookApp } from "../runner.tsx"

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

function decodeLastOsc52(chunks: string[]): string | null {
  const osc = chunks.findLast((s) => s.includes("\x1b]52;c;"))
  if (!osc) return null
  const match = osc.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
  if (!match) return null
  return Buffer.from(match[1]!, "base64").toString("utf-8")
}

describe("storybook runner selection", () => {
  test("drag from story list into preview selects only list-pane text", async () => {
    using term = createTermless({ cols: 100, rows: 30 })
    const chunks: string[] = []
    const emulator = (term as unknown as { _emulator: { feed: (s: string) => void } })._emulator
    const origFeed = emulator.feed.bind(emulator)
    emulator.feed = (data: string) => {
      chunks.push(data)
      origFeed(data)
    }

    const handle = await run(<StorybookApp initialStoryId="ToolCall/read" />, term, {
      selection: true,
      mouse: true,
    } as never)
    await settle()
    expect(term.screen).toContainText("Stories")
    expect(term.screen).toContainText("read a file")
    chunks.length = 0

    // Start in the left list pane and drag well into the right preview.
    mouseDown(term, 2, 1)
    await settle(80)
    mouseMove(term, 70, 4)
    await settle(80)
    mouseUp(term, 70, 4)
    await settle(300)

    const decoded = decodeLastOsc52(chunks)
    expect(decoded).not.toBeNull()
    expect(decoded).toContain("Stories")
    expect(decoded).not.toContain("read a file")

    handle.unmount()
  })
})
