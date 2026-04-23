/**
 * Regression test — trackpad jitter filter.
 *
 * Reproduces the wheel7.log scenario: during a slow, sustained scroll in
 * one direction, macOS trackpads occasionally emit a single opposite-sign
 * wheel event (visible in the log as deltaY=+1 among a stream of deltaY=-1).
 * Without a jitter filter, each spurious event produces a 1-row hop back.
 *
 * Invariant: during a sustained scroll, a single opposite event is dropped
 * as trackpad noise. Two consecutive opposite events always commit (real
 * reversal) — verified by wheel-monotonic.test.tsx.
 */

import { test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import React from "react"
import { SearchProvider } from "silvery"
import { App } from "../src/App.tsx"
import type { LogRow, ViewConfig } from "../src/view-config.ts"

const config: ViewConfig = { name: "test", fields: [{ key: "msg", label: "msg" }] } as ViewConfig
const rows: LogRow[] = Array.from({ length: 300 }, (_, i) => ({
  id: `r${i}`,
  lineNo: i + 1,
  kind: "msg",
  fields: { msg: `row ${i.toString().padStart(3, "0")}` },
  raw: { msg: `row ${i.toString().padStart(3, "0")}` },
}))

function topRow(text: string): number {
  const m = text.match(/row (\d{3})/)
  return m?.[1] != null ? Number(m[1]) : -1
}

test("lone opposite event during sustained scroll is dropped", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
  try {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <SearchProvider>
        <App path={__filename} config={config} rows={rows} />
      </SearchProvider>,
    )

    // 8 sustained wheel-up events — enough to arm the filter (threshold = 3).
    for (let i = 0; i < 8; i++) {
      await app.wheel(10, 10, -1)
      await vi.advanceTimersByTimeAsync(50)
    }
    const afterSustained = topRow(app.text)

    // Lone opposite event — trackpad jitter. Should be dropped.
    await app.wheel(10, 10, +1)
    await vi.advanceTimersByTimeAsync(50)
    const afterJitter = topRow(app.text)

    // Viewport must not move on the spurious event.
    expect(afterJitter).toBe(afterSustained)

    // Resume scrolling up — still sustained, no jitter.
    for (let i = 0; i < 3; i++) {
      await app.wheel(10, 10, -1)
      await vi.advanceTimersByTimeAsync(50)
    }
    const afterResume = topRow(app.text)
    expect(afterResume).toBeLessThan(afterJitter)
  } finally {
    vi.useRealTimers()
  }
})

test("two consecutive opposite events commit (real reversal)", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
  try {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <SearchProvider>
        <App path={__filename} config={config} rows={rows} />
      </SearchProvider>,
    )

    // Sustained scroll down.
    for (let i = 0; i < 6; i++) {
      await app.wheel(10, 10, +1)
      await vi.advanceTimersByTimeAsync(50)
    }
    const afterSustained = topRow(app.text)

    // Real reversal — two consecutive opposite events. First is filtered,
    // second commits the direction change.
    await app.wheel(10, 10, -1)
    await vi.advanceTimersByTimeAsync(50)
    await app.wheel(10, 10, -1)
    await vi.advanceTimersByTimeAsync(50)
    await app.wheel(10, 10, -1)
    await vi.advanceTimersByTimeAsync(50)

    const afterReversal = topRow(app.text)
    // Should have moved back up from the post-sustained position.
    expect(afterReversal).toBeLessThan(afterSustained)
  } finally {
    vi.useRealTimers()
  }
})
