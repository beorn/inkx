/**
 * useSynchronizedPhase scope contract — an INACTIVE / static phase does no
 * work, so it must NOT require an app-root scope: a component that calls it
 * with active:false renders fine through renderString (which provides no
 * ScopeProvider). An ACTIVE multi-step clock genuinely needs a shared scope
 * and must still throw loudly when rendered without one — silent fallback
 * would only defer the failure to the first scope use.
 *
 * Regression: `dutiful --once` (renderString, no scope) crashed because the
 * header's glimmer sweep calls useSynchronizedPhase({ active: false }) and the
 * hook acquired a scope eagerly (useScopeEffect → useScope() throws) even while
 * the clock was disabled — contradicting the hook's own documented contract.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { Text, renderString } from "../src"
import { useSynchronizedPhase } from "../src/ui/components/Pulse"

function Glimmer({ active }: { active: boolean }) {
  const phase = useSynchronizedPhase({ active, periodMs: 1_800, steps: 48, reducedMotion: false })
  return <Text>phase {phase}</Text>
}

describe("useSynchronizedPhase scope contract", () => {
  test("an inactive phase renders without an app-root scope (renderString)", async () => {
    const output = await renderString(<Glimmer active={false} />, { width: 20 })
    expect(output).toContain("phase 0")
  })

  test("an active multi-step clock still throws loudly without a scope", async () => {
    let error: unknown
    try {
      await renderString(<Glimmer active={true} />, { width: 20 })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/app-root scope/)
  })
})
