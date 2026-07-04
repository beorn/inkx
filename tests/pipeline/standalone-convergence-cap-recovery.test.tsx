/**
 * @failure When the STANDALONE convergence drain
 *   (`drainStandaloneCommitRerenders` in create-app.tsx) hits
 *   `MAX_CONVERGENCE_PASSES` with a React-requested rerender STILL pending,
 *   the historical behaviour was `pendingRerender = false; return` — it
 *   SILENTLY DROPPED the pending rerender. Under a steadily-growing stream (a
 *   ListView re-measuring a growing assistant block — the boxSize feedback
 *   edge in @km/silvercode/19383) that drop strands `currentBuffer` one pass
 *   behind committed React state: layout allocated rows whose paint was
 *   dropped, so the user sees a blank hole / a frozen, under-rendered frame
 *   that only heals on the next unrelated input.
 * @level l2
 * @consumer @si/silvercode/19383-turn-stall (wip commit 8e2b8060 non-lossy cap)
 *
 * The fix (create-app.tsx `drainStandaloneCommitRerenders`): at the cap, do
 * NOT drop the rerender. Instead
 *   1. record the exhaustion in the always-on pass ring
 *      (`recordPassRing("unknown", "standalone-flush-exhaustion")`),
 *   2. render ONE final pass so this frame paints the LATEST committed state
 *      (`currentBuffer = doRender()`), which `renderStandaloneFrame` then
 *      paints with all rows dirty (a full, self-consistent repaint), and
 *   3. schedule EXACTLY ONE follow-up standalone frame with a fresh budget
 *      (`scheduleFollowupStandaloneFrame`) to absorb any residual feedback.
 * This is bounded (one extra frame per batch, self-limiting) and non-lossy —
 * a steadily-growing stream converges one frame later instead of stranding
 * the buffer behind committed state.
 *
 * REGRESSION CLASS THIS GUARDS ("at-quota state leak"):
 *   - Reintroduce the silent `pendingRerender = false; return` drop (no final
 *     doRender, no follow-up frame) → the growing stream strands below its
 *     converged size and the last painted frame under-renders. Caught by the
 *     "final content fully converged" assertion (count=TARGET).
 *   - Paint a partial / stale buffer at the cap (drop the `doRender()` or the
 *     `markAllRowsDirty()` full-repaint) → the SILVERY_STRICT incremental
 *     (tier 1) / residue (tier 2) checks that fire inside `runtime.render`
 *     diverge from a fresh render of committed state → an
 *     IncrementalRenderMismatch / residue throw surfaces (as an unhandled
 *     rejection → panic on the async standalone path). Caught by the
 *     "no strict / render error" assertion.
 *   - Drop the ring breadcrumb → the "cap was actually exercised" assertion
 *     stops proving the scenario reaches the cap path (guards the scenario
 *     itself against silently regressing to a sub-cap settle after a refactor;
 *     the sub-cap negative-control test below proves the breadcrumb is
 *     cap-specific, not emitted on every standalone frame).
 *
 * The scenario drives the cap through the REAL run()/createApp standalone
 * render path (the test renderer, `createRenderer`, lacks this recovery). A
 * self-limiting microtask chain grows a column: each committed render up to
 * TARGET schedules the next increment on a microtask, and because those
 * microtasks land inside `drainStandaloneCommitRerenders`'s per-iteration
 * `await Promise.resolve()`, the loop keeps finding `pendingRerender` true and
 * exceeds MAX_CONVERGENCE_PASSES (= 2) within one standalone frame.
 */

import React, { useEffect, useLayoutEffect, useState } from "react"
import { describe, test, expect, beforeAll, afterAll } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import {
  resetPassRing,
  formatPassRingBreakdown,
} from "../../packages/ag-term/src/runtime/pass-cause"

const STANDALONE_EXHAUSTION_EDGE = "standalone-flush-exhaustion"
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Grows `count` 0 → `target` via a self-limiting microtask chain kicked by a
 * standalone (post-mount) setState. With `target` > MAX_CONVERGENCE_PASSES the
 * chain outruns one drain budget and forces the cap-exceed recovery; with
 * `target` <= the cap it settles normally (the negative control).
 */
function GrowingStream({ target }: { target: number }) {
  const [n, setN] = useState(0)

  // Standalone KICK: fire the first increment on a macrotask AFTER the initial
  // mount has settled, so it flows through the standalone render path
  // (store/onRender case 3 → renderStandaloneFrame), NOT the wider
  // initial-render bounded settle.
  useEffect(() => {
    const t = setTimeout(() => setN((v) => (v === 0 ? 1 : v)), 0)
    return () => clearTimeout(t)
  }, [])

  // Self-perpetuating growth: each committed render up to `target` schedules
  // the next increment on a microtask. useLayoutEffect fires synchronously
  // inside the commit the drain drives, so the microtask lands inside the next
  // drain iteration's `await Promise.resolve()` — keeping pendingRerender true
  // and pushing the loop past the cap within a single standalone frame.
  useLayoutEffect(() => {
    if (n >= 1 && n < target) {
      queueMicrotask(() => setN((v) => (v < target ? v + 1 : v)))
    }
  }, [n, target])

  // Render n content rows so the painted frame visibly reflects the converged
  // count. A dropped rerender at the cap strands the visible rows below target.
  return (
    <Box flexDirection="column">
      <Text>{`count=${n}`}</Text>
      {Array.from({ length: n }, (_, i) => (
        <Text key={i}>{`row ${i}`}</Text>
      ))}
    </Box>
  )
}

/**
 * Grows `count` WITHOUT BOUND — every committed render schedules another
 * increment on a microtask, so `drainStandaloneCommitRerenders` never settles:
 * each standalone frame exhausts its fresh budget and hits the cap, so the
 * CONSECUTIVE cap-exceed streak climbs frame after frame. Unlike GrowingStream
 * (self-limiting at `target`, small streak, a legit transient), this models the
 * PERPETUAL feedback edge the non-lossy follow-up-frame recovery would otherwise
 * paper over forever — the case the new STRICT bounded-streak guard fails loud on.
 */
function PerpetualStream() {
  const [n, setN] = useState(0)

  // Standalone KICK (post-mount, macrotask): flows through the standalone render
  // path (store/onRender case 3 → renderStandaloneFrame), not the initial settle.
  useEffect(() => {
    const t = setTimeout(() => setN((v) => (v === 0 ? 1 : v)), 0)
    return () => clearTimeout(t)
  }, [])

  // NEVER self-limits: each commit schedules the next increment unconditionally,
  // so pendingRerender stays true across every drain iteration → the cap is hit
  // every standalone frame → the consecutive streak grows without bound.
  useLayoutEffect(() => {
    if (n >= 1) queueMicrotask(() => setN((v) => v + 1))
  }, [n])

  return (
    <Box flexDirection="column">
      <Text>{`count=${n}`}</Text>
    </Box>
  )
}

/**
 * Drives PerpetualStream until the bounded-streak guard throws, returning the
 * captured "convergence bound exceeded" rejections. The guard makes the void-ed
 * standalone frame throw, so this scenario MUST produce real unhandled
 * rejections; we swap the process listeners for the drive so the deliberate
 * rejections are captured here rather than failing the vitest worker or racing
 * create-app's panic handler, then restore the originals.
 */
async function driveStandalonePerpetual(): Promise<unknown[]> {
  const captured: unknown[] = []
  const isConvergenceThrow = (r: unknown) => /convergence bound exceeded/i.test(String(r))
  const capture = (r: unknown) => captured.push(r)
  // Snapshot + silence every existing unhandledRejection listener (vitest's
  // worker handler included) for the drive: the perpetual edge deliberately
  // makes the void-ed standalone frame throw, so it MUST emit real rejections.
  // We want ONLY our own capture to see them — otherwise vitest's handler fails
  // the worker on the deliberate rejection.
  const original = process.listeners("unhandledRejection")
  process.removeAllListeners("unhandledRejection")
  process.on("unhandledRejection", capture)
  try {
    using term = createTermless({ cols: 40, rows: 20 })
    resetPassRing()
    const handle = await run(<PerpetualStream />, term)
    // run() installed create-app's own unhandledRejection→panic handler. Strip
    // it too so our deliberate rejections are captured cleanly instead of
    // panicking (the panic logs during teardown → vitest EnvironmentTeardownError).
    // The kick is a setTimeout(0) macrotask and the guard needs 6 consecutive
    // frames, so no throw can fire before this runs.
    for (const l of process.listeners("unhandledRejection")) {
      if (l !== capture) process.off("unhandledRejection", l)
    }
    // Poll until the guard throws — terminate via the thrown error, not a
    // wall-clock timeout. Each standalone frame yields at its setImmediate
    // boundary, so a few settles cover the > STANDALONE_CAP_STREAK_LIMIT (= 5)
    // consecutive cap-exceed frames the guard needs before it escalates.
    for (let i = 0; i < 12; i++) {
      // eslint-disable-next-line no-await-in-loop -- serial drive ticks
      await settle(20)
      if (captured.some(isConvergenceThrow)) break
    }
    handle.unmount()
    // Drain any in-flight frame's rejection into our capture before restoring
    // the original (vitest) listeners, so no late rejection escapes the sandbox.
    await settle(20)
    await settle(20)
    return captured.filter(isConvergenceThrow)
  } finally {
    process.removeAllListeners("unhandledRejection")
    for (const l of original) process.on("unhandledRejection", l as never)
  }
}

async function driveStandaloneGrowth(target: number): Promise<{
  screen: string
  ringBreakdown: string
  strictRejections: unknown[]
}> {
  const rejections: unknown[] = []
  const onRejection = (reason: unknown) => rejections.push(reason)
  process.on("unhandledRejection", onRejection)
  try {
    using term = createTermless({ cols: 40, rows: 20 })
    resetPassRing()
    const handle = await run(<GrowingStream target={target} />, term)
    await handle.waitForLayoutStable?.()

    // Let the standalone kick + the microtask growth chain + the scheduled
    // follow-up frame(s) run and paint. Several macrotask ticks cover the
    // setTimeout kick, the per-frame setImmediate coalescing, and the
    // setImmediate-scheduled follow-up frame(s).
    for (let i = 0; i < 8; i++) await settle(20)
    await handle.waitForLayoutStable?.()
    await settle(20)

    const screen = term.screen!.getText()
    const ringBreakdown = formatPassRingBreakdown()
    handle.unmount()
    return {
      screen,
      ringBreakdown,
      strictRejections: rejections.filter((r) =>
        /convergence|incremental|residue|mismatch|strict|render/i.test(String(r)),
      ),
    }
  } finally {
    process.off("unhandledRejection", onRejection)
  }
}

describe("@si/silvercode/19383 — standalone convergence cap recovers non-lossily", () => {
  let prevStrict: string | undefined
  // tier 2 = incremental (tier 1) + residue (tier 2); both fire inside
  // runtime.render on every painted frame, including the cap-recovery frame.
  beforeAll(() => {
    prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "2"
  })
  afterAll(() => {
    if (prevStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = prevStrict
  })

  test("a standalone growing stream that EXCEEDS the cap converges fully under STRICT", async () => {
    const TARGET = 6 // comfortably > MAX_CONVERGENCE_PASSES (= 2)
    const { screen, ringBreakdown, strictRejections } = await driveStandaloneGrowth(TARGET)

    // (1) The cap was actually exercised — the scenario reached the recovery
    // path, not merely a bounded 2-pass settle. Guards the scenario itself.
    expect(
      ringBreakdown,
      `standalone cap-exceed recovery was never triggered — the scenario no longer ` +
        `stresses drainStandaloneCommitRerenders past MAX_CONVERGENCE_PASSES. ring=${ringBreakdown}`,
    ).toContain(STANDALONE_EXHAUSTION_EDGE)

    // (2) STRICT stayed green through the recovery — no incremental/residue
    // mismatch (a partial / stale buffer at the cap would throw here).
    expect(
      strictRejections,
      `SILVERY_STRICT threw during the cap recovery frame — the recovery painted a ` +
        `partial/stale buffer instead of a full repaint of committed state:\n${strictRejections
          .map(String)
          .join("\n")}`,
    ).toHaveLength(0)

    // (3) Non-lossy: the final painted frame is fully converged. The drop
    // regression strands the count below TARGET.
    expect(
      screen,
      `standalone cap recovery stranded the buffer below its converged size — the ` +
        `pending rerender was dropped at the cap (at-quota state leak). screen:\n${screen}`,
    ).toContain(`count=${TARGET}`)
    expect(screen, `converged content row missing:\n${screen}`).toContain(`row ${TARGET - 1}`)
  })

  test("negative control: a sub-cap standalone settle does NOT emit the exhaustion breadcrumb", async () => {
    // TARGET === MAX_CONVERGENCE_PASSES: the chain settles within one drain
    // budget, so the recovery path must NOT fire. This proves assertion (1)
    // above is keyed to the cap-exceed path specifically, not to any standalone
    // render — a breadcrumb emitted on every frame would be a false positive.
    const TARGET = 2
    const { screen, ringBreakdown, strictRejections } = await driveStandaloneGrowth(TARGET)

    expect(strictRejections, strictRejections.map(String).join("\n")).toHaveLength(0)
    expect(
      ringBreakdown,
      `sub-cap standalone settle spuriously emitted the cap-exceed breadcrumb — the ` +
        `recovery path fired without the cap being exceeded. ring=${ringBreakdown}`,
    ).not.toContain(STANDALONE_EXHAUSTION_EDGE)
    // It still converges (no regression to the happy path).
    expect(screen).toContain(`count=${TARGET}`)
  })

  test("a PERPETUAL standalone feedback edge fails loud under STRICT instead of soft-recovering forever", async () => {
    // GrowingStream self-limits at `target`, so its consecutive cap-exceed streak
    // stays small — a legit transient the non-lossy recovery absorbs (the tests
    // above keep streak <= STANDALONE_CAP_STREAK_LIMIT and must NOT throw).
    // PerpetualStream NEVER settles, so the streak climbs past
    // STANDALONE_CAP_STREAK_LIMIT (= 5); at that point the new guard escalates to
    // a hard `assertBoundedConvergence` throw (SILVERY_STRICT=2 from beforeAll →
    // isStrictEnabled("incremental", 2) is true AND strict "2" makes the assert
    // throw) rather than scheduling yet another papering-over follow-up frame.
    // The throw rejects the void-ed standalone frame promise, carrying the
    // "convergence bound exceeded" message — the fail-loud is what TERMINATES the
    // otherwise-perpetual soft-recovery loop.
    const convergenceThrows = await driveStandalonePerpetual()
    expect(
      convergenceThrows.length,
      `the perpetual standalone feedback edge never tripped the bounded-streak ` +
        `fail-loud — drainStandaloneCommitRerenders kept soft-recovering forever ` +
        `instead of escalating to assertBoundedConvergence once the consecutive ` +
        `cap-exceed streak exceeded STANDALONE_CAP_STREAK_LIMIT (= 5). captured ` +
        `convergence throws: ${convergenceThrows.map(String).join(" | ") || "(none)"}`,
    ).toBeGreaterThan(0)
    expect(String(convergenceThrows[0])).toContain("convergence bound exceeded in standalone-flush")
  })
})
