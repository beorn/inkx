/**
 * Regression test — fast-scroll monotonicity.
 *
 * Reproduces the "scroll up quickly, then drifts slowly back down" bug: a
 * rapid trackpad flick sends a stream of wheel-up events, often ending
 * with 1-2 tiny opposite-direction events (OS inertia tail). If the
 * velocity estimator lets the tail flip the stored sign, momentum runs in
 * the wrong direction after release.
 *
 * The invariant under test: during a monotonic scroll gesture the
 * viewport's row offset must be monotonic too (up gesture → offset only
 * decreases or stays equal — never increases), both during the wheel
 * phase and during the momentum phase.
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

// Read the lowest visible row number as a proxy for viewport position.
function topRow(text: string): number {
  const m = text.match(/row (\d{3})/)
  return m?.[1] != null ? Number(m[1]) : -1
}

test("rapid scroll-up with OS inertia tail stays monotonic", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
  try {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(
      <SearchProvider>
        <App path={__filename} config={config} rows={rows} />
      </SearchProvider>,
    )
    const initial = topRow(app.text)
    expect(initial).toBeGreaterThan(0)

    // Main flick — 15 rapid wheel-up events, ~16ms apart (trackpad stream).
    for (let i = 0; i < 15; i++) {
      await app.wheel(10, 10, -1)
      await vi.advanceTimersByTimeAsync(16)
    }
    const afterFlick = topRow(app.text)
    expect(afterFlick).toBeLessThan(initial)

    // OS inertia tail — 2 tiny opposite-direction events. These arrive
    // in the stream but should NOT flip momentum to the opposite direction.
    await vi.advanceTimersByTimeAsync(20)
    await app.wheel(10, 10, +1)
    await vi.advanceTimersByTimeAsync(30)
    await app.wheel(10, 10, +1)

    // Let release + momentum play out.
    await vi.advanceTimersByTimeAsync(2000)
    const afterMomentum = topRow(app.text)

    // Momentum should continue scrolling up OR settle — never drift back
    // down past the post-flick position.
    expect(afterMomentum).toBeLessThanOrEqual(afterFlick + 2) // +2 rows tolerance for tail events
  } finally {
    vi.useRealTimers()
  }
})
