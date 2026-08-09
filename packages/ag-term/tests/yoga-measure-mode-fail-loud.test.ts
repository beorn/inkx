/**
 * The yoga adapter must not silently downgrade one width mode into another.
 *
 * Yoga models exactly three measure modes and `min-content` is not among them.
 * The adapter's mode translation previously ended in `return "undefined"`, so
 * ANY unrecognized numeric mode — a wasm/binding version skew, or a
 * `min-content` measurement only flexily can serve — became `"undefined"` and
 * produced a plausible wrong layout instead of an error.
 *
 * `createYogaEngine` takes the yoga object as a parameter, so this exercises the
 * real translation path with a fake yoga: no WASM, no layout, no timing.
 */
import { describe, expect, test } from "vitest"
import type { MeasureMode } from "@silvery/ag/layout-types"
import { createYogaEngine } from "@silvery/ag-term/adapters/yoga-adapter"

const MODE_UNDEFINED = 0
const MODE_EXACTLY = 1
const MODE_AT_MOST = 2

/** Captures the measure callback the adapter installs, so we can drive it directly. */
function engineWithCapturedMeasure(): {
  invoke: (mode: number) => MeasureMode
} {
  let captured: ((w: number, wm: number, h: number, hm: number) => unknown) | undefined
  const fakeYoga = {
    MEASURE_MODE_UNDEFINED: MODE_UNDEFINED,
    MEASURE_MODE_EXACTLY: MODE_EXACTLY,
    MEASURE_MODE_AT_MOST: MODE_AT_MOST,
    Node: {
      create: () => ({
        setMeasureFunc: (fn: (w: number, wm: number, h: number, hm: number) => unknown) => {
          captured = fn
        },
      }),
    },
  }

  const engine = createYogaEngine(fakeYoga as never)
  const node = engine.createNode()
  let seen: MeasureMode | undefined
  node.setMeasureFunc((_w, widthMode) => {
    seen = widthMode
    return { width: 0, height: 0 }
  })
  if (captured === undefined) throw new Error("adapter never installed a measure func")

  return {
    invoke: (mode: number) => {
      seen = undefined
      captured!(0, mode, 0, MODE_UNDEFINED)
      if (seen === undefined) throw new Error("measure func was not reached")
      return seen
    },
  }
}

describe("yoga adapter measure-mode translation", () => {
  test("translates each mode yoga actually models", () => {
    const { invoke } = engineWithCapturedMeasure()
    expect(invoke(MODE_UNDEFINED)).toBe("undefined")
    expect(invoke(MODE_EXACTLY)).toBe("exactly")
    expect(invoke(MODE_AT_MOST)).toBe("at-most")
  })

  test("throws on an unrecognized mode instead of downgrading it to undefined", () => {
    const { invoke } = engineWithCapturedMeasure()
    // 3 is not a yoga measure mode. Under the old catch-all this returned
    // "undefined" and the caller measured against the wrong contract.
    expect(() => invoke(3)).toThrow(/unrecognized measure mode 3/u)
  })

  test("names flexily as the fix, since min-content is the realistic caller", () => {
    const { invoke } = engineWithCapturedMeasure()
    expect(() => invoke(99)).toThrow(/SILVERY_ENGINE=flexily/u)
  })
})
