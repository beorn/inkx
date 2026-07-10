/**
 * @failure The `fresh-layout` STRICT oracle (packet #1) was wired into the
 *   test-driver renderer + scheduler but NOT the createApp/run() production
 *   renderer (runtime/renderer.ts) — the very path that renders the follow-up
 *   standalone frame (scheduleFollowupStandaloneFrame) where @si/render/19436
 *   deferred-lane layout-feedback content lands. So on that frame the production
 *   oracle used a SHARED-layout fresh baseline and was blind to a missed-dirty
 *   stale rect. Packet #2 completes fresh-layout to that third STRICT site.
 * @level l2
 * @consumer @si/audit-delta-2026-07/20977-pipeline-gate/20981-oracle-fidelity/20985-convergence
 *
 * SHAPE (chosen over a new `convergence` slug + settleAfterCommit refactor): NO
 * new slug / subsystem / helper. The deferred-lane stale rect surfaces on the
 * REAL follow-up frame via the EXISTING fresh-layout oracle once that frame's
 * baseline is independent; the legitimate one-frame-late path renders correct
 * converged content on that frame → green BY CONSTRUCTION (not a heuristic).
 *
 * The catch tests drive the REAL production consumer (createApp/run → the
 * runtime/renderer.ts doRender STRICT block). create-app's `STRICT_MODE` gate is
 * import-time, so they run only when SILVERY_STRICT was truthy at launch (the
 * coordinator's `SILVERY_STRICT=2` verify + the STRICT suites) — otherwise the
 * production oracle is inactive and the tests skip. Within that launch, the
 * RED→GREEN is toggled by `fresh-layout` on (`SILVERY_STRICT=2`, catches) vs off
 * (`SILVERY_STRICT=2,!fresh-layout`, blind — the gap this packet closes).
 */

import React, { useEffect, useState } from "react"
import { describe, test, expect, afterEach } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text, useBoxRectDangerously } from "../../src/index.js"
import { useAgNode } from "../../packages/ag-react/src/hooks/useAgNode"
import { run, useInput } from "../../packages/ag-term/src/runtime/run"
import { isStrictEnabled, resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import { IncrementalRenderMismatchError } from "../../packages/ag-term/src/scheduler"
import type { AgNode } from "@silvery/ag/types"

// Captured at module load — mirrors create-app.tsx's import-time STRICT_MODE.
// The production STRICT comparison only runs when this was truthy at launch.
const LAUNCH_STRICT_ON = isStrictEnabled("incremental", 1)

// --- Scenario (b): legitimate one-frame-late layout feedback ------------------

function Probe({ log }: { log?: number[] }) {
  const { width } = useBoxRectDangerously()
  log?.push(width)
  return <Text>{`[P w=${width}]`}</Text>
}

const FULL = 40
const SPACER = 20

function FeedbackApp({ log }: { log?: number[] }) {
  const [wide, setWide] = useState(false)
  useInput((input) => {
    if (input === "g") setWide((w) => !w)
  })
  return (
    <Box flexDirection="row" width={FULL}>
      <Box flexGrow={1}>
        <Probe log={log} />
      </Box>
      {wide ? (
        <Box width={SPACER}>
          <Text>S</Text>
        </Box>
      ) : null}
    </Box>
  )
}

// --- Scenario (a): a missed-dirty desync that ships on the convergence path ----

let capturedRoot: AgNode | null = null
function Capture(): null {
  const h = useAgNode()
  useEffect(() => {
    if (!h?.node) return
    let r = h.node
    while (r.parent) r = r.parent
    capturedRoot = r
  })
  return null
}

// Memoized so the sibling-driven re-render never reconciles the target — its
// flexily width stays whatever we poke it to. This models a "layout input
// changed without markDirty" desync, which the public reconciler cannot express
// (it always markDirty's on a prop change).
const MemoTarget = React.memo(function MemoTarget(): React.ReactElement {
  return (
    <Box flexDirection="row" width={80} height={1}>
      <Box testID="t" width={20} flexShrink={0} height={1} backgroundColor="red">
        <Capture />
      </Box>
    </Box>
  )
})

function DesyncApp(): React.ReactElement {
  const [n, setN] = useState(0)
  useInput((input) => {
    if (input === "s") setN((x) => x + 1)
  })
  return (
    <Box flexDirection="column" width={80} height={8}>
      <MemoTarget />
      <Text>{`sibling ${n}`}</Text>
    </Box>
  )
}

function findByTestId(node: AgNode, id: string): AgNode | null {
  const p = node.props as Record<string, unknown> | undefined
  if (p && (p.testID === id || p.id === id)) return node
  for (const child of node.children) {
    const found = findByTestId(child, id)
    if (found) return found
  }
  return null
}
function flexNodeOf(node: AgNode): any {
  return (node.layoutNode as unknown as { getFlexilyNode(): unknown }).getFlexilyNode()
}
// Restore flexily's "I'm up to date" fingerprints without recomputing — mirrors
// flexily's own private reset to simulate a markDirty that never fired.
function forceFlexilyClean(f: any): void {
  f._isDirty = false
  f._flex.layoutValid = true
  for (let i = 0; i < f.getChildCount(); i++) forceFlexilyClean(f.getChild(i))
}

async function seedStaleTargetAndPress(strict: string): Promise<{ threw: boolean }> {
  process.env.SILVERY_STRICT = strict
  resetStrictCache()
  using term = createTermless({ cols: 80, rows: 10 })
  const handle = await run(<DesyncApp />, term)
  await handle.waitForLayoutStable?.()
  const target = capturedRoot ? findByTestId(capturedRoot, "t") : null
  if (!target) throw new Error("test setup: target not captured")
  // Desync: flexily width := 40, but the tree stays fingerprint-clean, so the
  // incremental path keeps the pre-desync width (20). A from-scratch recompute
  // (the fresh-layout baseline) would honor 40.
  flexNodeOf(target).setWidth(40)
  forceFlexilyClean(flexNodeOf(capturedRoot!))
  try {
    await handle.press("s") // sibling-only re-render; MemoTarget stays stale
    return { threw: false }
  } catch (e) {
    if (e instanceof IncrementalRenderMismatchError) return { threw: true }
    throw e
  }
}

describe("@si/render/20985 — fresh-layout oracle on the production convergence path", () => {
  let savedStrict: string | undefined
  afterEach(() => {
    if (savedStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = savedStrict
    resetStrictCache()
    capturedRoot = null
  })

  test("legitimate one-frame-late layout-feedback stays GREEN under fresh-layout (real run() consumer)", async () => {
    savedStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "2"
    resetStrictCache()

    using term = createTermless({ cols: 50, rows: 6 })
    const widthRenders: number[] = []
    const handle = await run(<FeedbackApp log={widthRenders} />, term)
    await handle.waitForLayoutStable?.()
    expect(term.screen!.getText()).toContain(`[P w=${FULL}]`)

    await handle.press("g") // mounts the 20-wide spacer → pane shrinks to 20
    await handle.waitForLayoutStable?.()

    // Converged frame paints correctly and the production oracle did not
    // false-positive on the legitimate one-frame-late feedback.
    expect(term.screen!.getText()).toContain(`[P w=${FULL - SPACER}]`)
  })

  test.skipIf(!LAUNCH_STRICT_ON)(
    "GREEN: SILVERY_STRICT=2 CATCHES a missed-dirty stale rect on the production convergence frame",
    async () => {
      savedStrict = process.env.SILVERY_STRICT
      const { threw } = await seedStaleTargetAndPress("2")
      expect(threw).toBe(true)
    },
  )

  test.skipIf(!LAUNCH_STRICT_ON)(
    "gap without the fix: SILVERY_STRICT=2,!fresh-layout is BLIND to the same stale rect (shared baseline)",
    async () => {
      savedStrict = process.env.SILVERY_STRICT
      const { threw } = await seedStaleTargetAndPress("2,!fresh-layout")
      expect(threw).toBe(false)
    },
  )
})
