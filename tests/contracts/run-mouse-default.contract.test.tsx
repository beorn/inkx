/**
 * Defaults contract — `run()`'s `mouse` option and terminal mouse tracking.
 *
 * See tests/contracts/README.md for the convention. Drains the `mouse` item
 * from the Phase 2 backlog in `run-defaults.contract.test.tsx`.
 *
 * `run(element, term, options)` documents (RunOptions.mouse):
 *
 *   "Default: `true` in fullscreen mode, `false` in inline mode."
 *
 * The load-bearing consequence: when mouse tracking is enabled, silvery emits
 * the SGR any-event enable sequence (CSI ?1003h). That sequence is what makes
 * a terminal deliver the wheel as SGR mouse reports — which a scrollable
 * `ListView` scrolls the viewport with. When it is NOT emitted, terminals fall
 * back to "alternate scroll" and translate the wheel into cursor arrow keys
 * (ESC[A / ESC[B), which move a ListView's selection cursor instead. A
 * fullscreen app that turns mouse tracking off (or is denied the fullscreen
 * default) therefore scrolls the highlighted row instead of the viewport.
 *
 * This is exactly the regression `yrd watch` shipped by passing an explicit
 * `mouse: false` to a fullscreen ListView app. Bead:
 * @km/code/trackpad-wheel-not-scrolling.
 *
 * Emulator-branch note: `createTermless` resolves an omitted `mouse` by
 * probing the backend (see `resolveEmulatorMouseOption`), so it enables mouse
 * on omit regardless of mode. The fullscreen-omit → on and explicit-false →
 * off cases match the real-PTY branch faithfully and are pinned here; the
 * inline-omit → off default is a real-PTY-only distinction and is not
 * asserted through the emulator.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, ListView, Text } from "../../src/index"
import { run } from "../../packages/ag-term/src/runtime/run"

// CSI ?1003h — SGR any-event mouse tracking. Silvery emits this on startup iff
// mouse tracking is enabled. Its presence in the terminal's received bytes is
// the exact terminal-observable fact that decides scroll-vs-cursor for a wheel.
const ENABLE_MOUSE = "\x1b[?1003h"

const settle = (ms = 200): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function outputBytes(term: unknown): string {
  return (term as { out?: { getText(): string } }).out?.getText() ?? ""
}

// A representative scrollable surface — a fullscreen ListView is the shape
// (km's board, yrd's queue watch) that depends on wheel = viewport scroll.
function ScrollSurface() {
  return (
    <Box flexDirection="column" width={40} height={10}>
      <ListView<{ id: string; label: string }>
        items={Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, label: `Line ${i}` }))}
        height={10}
        estimateHeight={1}
        nav
        getKey={(item) => item.id}
        renderItem={(item) => <Text>{item.label}</Text>}
      />
    </Box>
  )
}

describe("contract: run() mouse tracking default", () => {
  test("contract: fullscreen omits mouse → mouse tracking enabled (wheel scrolls viewport)", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ScrollSurface />, term, { mode: "fullscreen" })
    try {
      await settle()
      expect(outputBytes(term).includes(ENABLE_MOUSE)).toBe(true)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("contract: explicit mouse:false → mouse tracking disabled (terminal alt-scrolls wheel to arrows)", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ScrollSurface />, term, { mode: "fullscreen", mouse: false })
    try {
      await settle()
      expect(outputBytes(term).includes(ENABLE_MOUSE)).toBe(false)
    } finally {
      handle.unmount()
    }
  }, 20_000)

  test("contract: explicit mouse:true → mouse tracking enabled", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<ScrollSurface />, term, { mode: "fullscreen", mouse: true })
    try {
      await settle()
      expect(outputBytes(term).includes(ENABLE_MOUSE)).toBe(true)
    } finally {
      handle.unmount()
    }
  }, 20_000)
})
