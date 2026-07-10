/**
 * `fresh-layout` STRICT slug — independent fresh-layout oracle (audit packet #1,
 * bead @si/audit-delta-2026-07/20977-pipeline-gate/20981-oracle-fidelity).
 *
 * GAP: the STRICT `incremental` oracle's "fresh" comparison render calls
 * `freshAg.layout()` on the SAME root whose flexily tree the incremental layout
 * just cleaned. The ag.ts layout-on-demand gate then skips `calculateLayout()`
 * (`!root.layoutNode.isDirty()`), so a layout-affecting change that failed to
 * markDirty flexily produces a STALE rect shared by BOTH paths — `incremental`
 * stays green while the on-screen layout is wrong vs a true from-scratch render.
 *
 * FIX: the `fresh-layout` slug (tier 2) makes the fresh baseline force-markDirty
 * the whole flexily tree before layout (markLayoutTreeDirty), so
 * `calculateLayout` recomputes every node independently and a stale rect surfaces
 * as a buffer mismatch.
 *
 * INJECTION: the public reconciler ALWAYS markDirty's on a prop change, so a
 * "style updated but flexily not dirtied" desync can only be produced below it.
 * We set the target's flexily width directly (`setWidth`), then restore every
 * node's `_isDirty=false` + `_flex.layoutValid=true` fingerprint — flexily now
 * believes it is up to date while its cached computed width is stale. The target
 * subtree is `React.memo`'d so subsequent reconciles never re-apply the JSX width
 * (which would markDirty and heal the desync). This reaches flexily internals
 * intentionally: it is the one desync the public API cannot express, and it is
 * exactly the class the slug exists to catch.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { IncrementalRenderMismatchError } from "@silvery/ag-term"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode } from "@silvery/ag/types"
import React from "react"

// Memoized so App re-renders (sibling tick) never reconcile the target — its
// flexily width stays whatever we poke it to.
const StaleTargetRow = React.memo(function StaleTargetRow(): React.ReactElement {
  return (
    <Box flexDirection="row" width={80} height={1}>
      <Box testID="stale-target" width={20} flexShrink={0} height={1} backgroundColor="red" />
    </Box>
  )
})

function App({ tick }: { tick: number }): React.ReactElement {
  return (
    <Box flexDirection="column" width={80} height={60}>
      <StaleTargetRow />
      <Text testID="sibling">tick {tick}</Text>
      {/* Realistic-scale filler (55 rows → 60+ nodes total). */}
      {Array.from({ length: 55 }, (_, i) => (
        <Text key={i}>filler row {i}</Text>
      ))}
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

/** Reach the underlying flexily Node behind a silvery LayoutNode adapter. */
function flexNodeOf(node: AgNode): any {
  return (node.layoutNode as unknown as { getFlexilyNode(): unknown }).getFlexilyNode()
}

/**
 * Restore flexily's "I'm up to date" fingerprints across the whole tree WITHOUT
 * recomputing — mirrors flexily's own private reset (layout-traversal.ts) to
 * simulate a markDirty that never fired. Leaves each node's cached computed
 * layout stale.
 */
function forceFlexilyClean(flexNode: any): void {
  flexNode._isDirty = false
  flexNode._flex.layoutValid = true
  for (let i = 0; i < flexNode.getChildCount(); i++) forceFlexilyClean(flexNode.getChild(i))
}

/**
 * Mount, then desync the target: set its flexily width to `staleWidth` and mark
 * the whole tree fingerprint-clean so the incremental path keeps the pre-desync
 * width (20). A from-scratch recompute would instead honor `staleWidth`.
 * Returns a trigger for a fresh STRICT frame (sibling tick, no target reflow).
 */
function mountWithStaleTarget(staleWidth: number): {
  triggerFrame: (tick: number) => void
} {
  const render = createRenderer({ cols: 80, rows: 60 })
  const app = render(<App tick={0} />)

  const target = findByTestId(app.getContainer(), "stale-target")
  if (!target?.layoutNode) throw new Error("test setup: target layoutNode not found")
  flexNodeOf(target).setWidth(staleWidth) // style := staleWidth; computed still 20; dirties
  forceFlexilyClean(flexNodeOf(app.getContainer())) // clean+valid; computed stays 20 (stale)

  return { triggerFrame: (tick: number) => app.rerender(<App tick={tick} />) }
}

describe("fresh-layout STRICT oracle (packet #1 — independent fresh baseline)", () => {
  let savedStrict: string | undefined

  beforeEach(() => {
    savedStrict = process.env.SILVERY_STRICT
    resetStrictCache()
  })

  afterEach(() => {
    if (savedStrict === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = savedStrict
    resetStrictCache()
  })

  test("RED→GREEN: SILVERY_STRICT=2 catches a shared stale rect (fresh baseline is independent)", () => {
    process.env.SILVERY_STRICT = "2"
    resetStrictCache()
    const { triggerFrame } = mountWithStaleTarget(40)
    // Incremental keeps the stale width-20 target (fingerprint-skipped). Without
    // fresh-layout the fresh baseline shares that stale rect → no throw. With it,
    // the fresh baseline recomputes width 40 → buffer mismatch → throws.
    expect(() => triggerFrame(1)).toThrow(IncrementalRenderMismatchError)
  })

  test("gap preserved when opted out: SILVERY_STRICT=2,!fresh-layout does NOT catch it", () => {
    process.env.SILVERY_STRICT = "2,!fresh-layout"
    resetStrictCache()
    const { triggerFrame } = mountWithStaleTarget(40)
    expect(() => triggerFrame(1)).not.toThrow()
  })

  test("tier 1 keeps the cheap shared baseline: SILVERY_STRICT=1 does NOT force a recompute", () => {
    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    const { triggerFrame } = mountWithStaleTarget(40)
    expect(() => triggerFrame(1)).not.toThrow()
  })

  test("no false positive: SILVERY_STRICT=2 is green when NOTHING is stale", () => {
    process.env.SILVERY_STRICT = "2"
    resetStrictCache()
    // setWidth(20) === the already-computed width → no desync. The forced
    // recompute must reproduce the identical layout (flexily determinism).
    const { triggerFrame } = mountWithStaleTarget(20)
    expect(() => triggerFrame(1)).not.toThrow()
    expect(() => triggerFrame(2)).not.toThrow()
  })

  test("isolate: SILVERY_STRICT=fresh-layout activates the check on its own", () => {
    process.env.SILVERY_STRICT = "fresh-layout"
    resetStrictCache()
    const { triggerFrame } = mountWithStaleTarget(40)
    expect(() => triggerFrame(1)).toThrow(IncrementalRenderMismatchError)
  })
})
