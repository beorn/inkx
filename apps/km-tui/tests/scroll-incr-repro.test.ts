/**
 * Regression: incremental rendering mismatch with scrolling boards.
 *
 * Sequence G, g, h, g on a scrolling board with 3 columns (12+10+8 items)
 * at 80x16. The final "g" opens a chord overlay (absolute positioned) that
 * was missing from the incremental render because STRICT output verification threw
 * during the output phase, preventing the render-phase buffer from being
 * saved to instance.prevBuffer.
 *
 * Bug: km-silvery.scroll-incr-fuzz
 */
import { describe, test, expect } from "vitest"
import { compareBuffers, formatMismatch } from "@silvery/test"
import { testEnv, item } from "./helpers/board-test.ts"

function scrollingFixture() {
  return () =>
    item(
      "board",
      item("col1", ...Array.from({ length: 12 }, (_, i) => item(`1-${String.fromCharCode(97 + i)}`))),
      item("col2", ...Array.from({ length: 10 }, (_, i) => item(`2-${String.fromCharCode(97 + i)}`))),
      item("col3", ...Array.from({ length: 8 }, (_, i) => item(`3-${String.fromCharCode(97 + i)}`))),
    )
}

describe("scroll-incr-chord: absolute overlay after scroll", () => {
  test("G, g, h, g — chord overlay present in incremental buffer", () => {
    const { board } = testEnv(scrollingFixture(), {
      columns: 80,
      rows: 16,
      viewMode: "cards",
      incremental: true,
      checkIncremental: false,
    })

    const steps = ["G", "g", "h", "g"]
    for (let i = 0; i < steps.length; i++) {
      const key = steps[i]!
      board.press(key)
      const inc = board._result.lastBuffer()
      if (!inc) continue
      const fresh = board._result.freshRender()
      const mismatch = compareBuffers(inc, fresh)
      if (mismatch) {
        const msg = formatMismatch(mismatch, { key, incrementalText: "", freshText: "" })
        expect.fail(`Step ${i} (${key}): incremental/fresh mismatch\n${msg}`)
      }
    }
  })
})
