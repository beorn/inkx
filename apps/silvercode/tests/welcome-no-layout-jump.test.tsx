/**
 * Regression test for Bug D — silvercode initial-render layout jumps.
 *
 * Original symptom (now fixed): at startup, the welcome layout settled
 * through 3 distinct layouts in quick succession, then 2 more after a
 * few seconds. `MeasuredBanner` had a hand-rolled `width > 0 ?
 * <SilverCodeBanner/> : null` gate that suppressed the empty-banner
 * state but cost a render pass with no banner content. Under
 * production's single-pass layout (`singlePassLayout: true` in
 * create-app.tsx), the useBoxRect-driven re-render is NOT auto-converged
 * inside the same commit — so the banner could sit at the empty state
 * until another state change drove a re-render, which the user saw as
 * the jump.
 *
 * Fix: silvery shipped a `<MeasuredBox>` primitive (commit e0c8d1af)
 * that defers children until measurement is non-zero, eliminating the
 * width=0 frame entirely. Welcome's `MeasuredBanner` now wraps
 * `<MeasuredBox>` and never paints with width=0.
 *
 * What this test guards
 * ---------------------
 * Application-level integration coverage that the fix is wired into
 * silvercode's Welcome component — the silvery-side primitive test
 * (`vendor/silvery/tests/features/measured-box.test.tsx`) only proves
 * the primitive works in isolation. This test mounts `<MeasuredBanner>`
 * with `singlePassLayout: true` (matching production), captures every
 * committed frame via `onFrame`, and asserts every frame paints the
 * banner — no transient empty-Box → measured-Box transition.
 *
 * If `MeasuredBanner` is ever refactored back to the hand-rolled `width
 * > 0 ? … : null` gate (or a future child gating bug shows up), this
 * test fails fast.
 */

import React from "react"
import { Box } from "silvery"
import { render, bufferToText } from "@silvery/test"
import { ScopeProvider } from "@silvery/ag-react"
import { createScope } from "@silvery/scope"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"
import { expect, test } from "vitest"
import { MeasuredBanner } from "../src/components/Welcome.tsx"

test("MeasuredBanner paints the banner on frame 0 under production-like single-pass layout (regression: Bug D)", async () => {
  // Pin the root to a wide, tall fixture matching production silvercode
  // chrome. Without explicit width/height the Box collapses (per silvery
  // CLAUDE.md "Pin root width/height when testing full-app layouts").
  const COLS = 120
  const ROWS = 50
  const scope = createScope("welcome-layout-jump-test")

  // Capture every committed frame's plain-text snapshot.
  const snapshots: string[] = []

  const tree = (
    <ScopeProvider scope={scope} appScope={scope}>
      <Box flexDirection="column" width={COLS} height={ROWS} alignItems="center" justifyContent="center">
        <MeasuredBanner agentLabel="Claude Code" />
      </Box>
    </ScopeProvider>
  )

  // Default maxLayoutPasses (= MAX_CONVERGENCE_PASSES = 2) mirrors
  // production's create-app.tsx — bounded layout-pass loop per doRender.
  const app = render(tree, {
    cols: COLS,
    rows: ROWS,
    onFrame: (_frame: string, buffer: TerminalBuffer) => {
      snapshots.push(bufferToText(buffer))
    },
  })

  // Drain microtasks + a couple of forced re-renders so any
  // layout-effect-triggered work has a chance to run. Production drives
  // these via the event loop's `processEventBatch` ticking.
  for (let i = 0; i < 5; i++) await Promise.resolve()
  app.rerender(tree)
  for (let i = 0; i < 5; i++) await Promise.resolve()

  // The shaded banner's wordmark uses ░▒▓█ shade chars filling the
  // letter strokes (positive-space gradient, 56-col-and-up tier).
  // EVERY captured frame must contain banner content — never an empty
  // centered Box that becomes the banner on the next frame.
  expect(snapshots.length, "render fired at least one frame").toBeGreaterThan(0)
  for (let i = 0; i < snapshots.length; i++) {
    expect(
      snapshots[i],
      `frame ${i}/${snapshots.length - 1} paints the shaded banner — no empty-Box → measured-Box transition`,
    ).toMatch(/[░▒▓█]/u)
  }

  // Stronger invariant: every captured frame is byte-identical (no
  // transient shifts during the initial-paint window).
  const settled = snapshots[snapshots.length - 1]!
  for (let i = 0; i < snapshots.length; i++) {
    expect(snapshots[i], `frame ${i} matches settled layout (no transient shift)`).toBe(settled)
  }

  app.unmount()
})
