/**
 * @failure A key press that triggers a layout-feedback (`layout-invalidate /
 *   boxSize`) edge paints a STALE frame: the production press / event-batch
 *   convergence path promotes the new committed rect via `commitLayout()` but
 *   never `flushSyncWork()`s the layout-signal subscriber's forceUpdate, so the
 *   converged re-render leaks to a later macrotask (or is dropped by the
 *   trailing `pendingRerender = false`). The user sees the pre-press width until
 *   the next event. Standalone async updates already recover non-lossily
 *   (@km/silvercode/19383); the press / processEventBatch paths did not.
 * @level l2
 * @consumer @si/render/19436-flush-convergence-bound
 *
 * Reproduce-first evidence (current main, SILVERY_STRICT=2 SILVERY_INSTRUMENT=1):
 *   immediately after `await handle.press("g")` the painted screen shows the
 *   stale pane width while the pane has visibly resized; `widthRenders` during
 *   the press is `[40]` (Probe rendered ONCE, with the stale committed width);
 *   the violation ring records `layout-invalidate (edge boxSize/boxRect)`.
 *   It only converges after extra macrotask ticks — i.e. NOT within the event.
 *
 * The fix mirrors the standalone drain: after `commitLayout()` the press /
 * event paths `flushSyncWork()` so the subscriber forceUpdate is drained within
 * the same event, and the residual (if any) is recovered non-lossily instead of
 * dropped.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text, useBoxRectDangerously } from "../../src/index.js"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"
import {
  resetPassRing,
  passRingSize,
  formatPassRingBreakdown,
} from "../../packages/ag-term/src/runtime/pass-cause"

// Probe is mounted INTO the flexGrow pane; it subscribes to that pane's
// measured rect via useBoxRectDangerously and renders the measured width. The
// measured width is only readable after silvery's commitLayout (React cannot
// resolve it inside its own commit), so the re-render that shows the new width
// requires the production path to flush + drain the post-commit forceUpdate.
function Probe({ tag, log }: { tag: string; log?: number[] }) {
  const { width } = useBoxRectDangerously()
  log?.push(width)
  return <Text>{`[${tag} w=${width}]`}</Text>
}

const FULL = 40
const SPACER = 20 // pane shrinks FULL -> FULL-SPACER = 20 when spacer mounts

function App({ log }: { log?: number[] }) {
  const [wide, setWide] = useState(false)
  useInput((input) => {
    if (input === "g") setWide((w) => !w)
  })
  return (
    <Box flexDirection="row" width={FULL}>
      <Box flexGrow={1}>
        <Probe tag="P" log={log} />
      </Box>
      {wide ? (
        <Box width={SPACER}>
          <Text>S</Text>
        </Box>
      ) : null}
    </Box>
  )
}

describe("@si/render/19436 — production convergence must not paint a stale frame", () => {
  test("press that resizes a measured pane paints the CONVERGED width within the event", async () => {
    using term = createTermless({ cols: 50, rows: 6 })
    const widthRenders: number[] = []
    const handle = await run(<App log={widthRenders} />, term)
    await handle.waitForLayoutStable?.()

    // Settled: pane fills the 40-wide row.
    expect(term.screen!.getText()).toContain(`[P w=${FULL}]`)

    widthRenders.length = 0
    resetPassRing()

    // Press "g": mounts the 20-wide spacer, shrinking the pane to 20. This
    // drives a layout-invalidate edge on the pane the Probe subscribes to.
    await handle.press("g")

    // Acceptance #1: the violation ring named the 3rd-pass feedback edge even
    // with the loop bounded — INSTRUMENT-independent (always-on ring).
    expect(passRingSize()).toBeGreaterThan(0)
    expect(formatPassRingBreakdown()).toContain("layout-invalidate")

    // The bug (RED on current main): the painted frame still shows the STALE
    // pre-press width (P w=40) even though the pane is now 20 wide. The
    // converged re-render leaked past the event boundary.
    const painted = term.screen!.getText()
    expect(
      painted,
      `production path painted a STALE frame — pane resized to ${FULL - SPACER} but ` +
        `the measured width still reads ${FULL}; the post-commit forceUpdate was ` +
        `not flushed within the event. widthRenders=${JSON.stringify(widthRenders)}\n${painted}`,
    ).toContain(`[P w=${FULL - SPACER}]`)
    expect(painted).not.toContain(`[P w=${FULL}]`)
  })
})
