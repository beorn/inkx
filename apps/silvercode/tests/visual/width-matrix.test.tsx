/**
 * Width-matrix smoke — exercises `runWidthMatrix` + `expectWidthMatrixInvariants`
 * against the welcome and helloWorld scenarios at every default breakpoint.
 *
 * The test asserts only the universal invariants (non-blank frame, no
 * U+FFFD replacement char). Scenario-specific assertions (side-panel
 * visibility, wrap thresholds, etc.) are out of scope here — they belong
 * in their own width-matrix test next to the feature under test.
 *
 * Failure surface: if a future render-pipeline change collapses the
 * frame at one width, this test points directly at the offending cols
 * via the `[width-matrix cols=N]` error wrapper.
 *
 * Bead: @km/silvercode/test-resize-matrix
 */

import { describe, expect, test } from "vitest"
import {
  DEFAULT_WIDTH_MATRIX,
  expectWidthMatrixInvariants,
  runWidthMatrix,
} from "../../src/test/width-matrix.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"

describe("width-matrix runner", () => {
  test("welcome scenario survives every default breakpoint", async () => {
    const widthsSeen: number[] = []
    await runWidthMatrix({ script: welcome }, ({ cols, driver }) => {
      widthsSeen.push(cols)
      expectWidthMatrixInvariants(driver.text, cols)
    })
    expect(widthsSeen).toStrictEqual([...DEFAULT_WIDTH_MATRIX])
  })

  test("helloWorld scenario survives every default breakpoint", async () => {
    await runWidthMatrix({ script: helloWorld }, ({ cols, driver }) => {
      expectWidthMatrixInvariants(driver.text, cols, {
        custom: (text) => (text.includes("Hi") ? null : "expected assistant 'Hi' to render at every width"),
      })
    })
  })

  test("custom invariant failures name the offending width", async () => {
    let captured: Error | null = null
    try {
      await runWidthMatrix(
        { script: welcome },
        ({ cols, driver }) => {
          expectWidthMatrixInvariants(driver.text, cols, {
            custom: (_text, c) => (c === 90 ? "synthetic failure for cols=90" : null),
          })
        },
        { widths: [40, 90, 160] },
      )
    } catch (err) {
      captured = err as Error
    }
    expect(captured).not.toBeNull()
    expect(captured!.message).toContain("cols=90")
    expect(captured!.message).toContain("synthetic failure")
  })

  test("runs cells sequentially with isolated scenarios", async () => {
    // Each cell gets a fresh scenario; mutating one cell's scenario must
    // not leak into the next. We verify by capturing scenario references
    // and ensuring they're distinct objects.
    const scenarios = new Set<object>()
    await runWidthMatrix(
      { script: welcome },
      ({ scenario }) => {
        scenarios.add(scenario)
      },
      { widths: [60, 120] },
    )
    expect(scenarios.size).toBe(2)
  })
})
