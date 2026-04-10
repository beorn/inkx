/**
 * Regression: List view incremental render mismatch after navigation.
 *
 * FREEZE: entire file uses testEnv — all tests access board._result.lastBuffer()
 * and board._result.freshRender() for incremental vs fresh buffer comparison.
 *
 * After navigating with j/k/h/l in list view mode, the incremental render
 * diverges from a fresh render. All seeds fail for medium and scrolling
 * fixtures in list view, while cards and columns views work correctly.
 */

import { describe, test, expect } from "vitest"
import { bufferToText, compareBuffers, formatMismatch } from "@silvery/test"
import { testEnv, item } from "./helpers/board-test.ts"

// Same PRNG as render-fuzz.fuzz.ts
function createPRNG(seed: number) {
  let s = seed | 0
  function splitmix32(): number {
    s = (s + 0x9e3779b9) | 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
  let a = splitmix32()
  let b = splitmix32()
  let c = splitmix32()
  let d = splitmix32()
  return function next(): number {
    const t = (b << 9) | 0
    let r = (a * 5) | 0
    r = (((r << 7) | (r >>> 25)) * 9) | 0
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = (d << 11) | (d >>> 21)
    return (r >>> 0) / 4294967296
  }
}

const NAV_KEYS = ["j", "k", "h", "l", "g", "G", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "<", ">"]

describe("list view incremental rendering", () => {
  // Exact reproduction of fuzz seed=42 medium/list (fails at iteration 49)
  test("medium/list seed=42: exact fuzz sequence", { timeout: 15_000 }, () => {
    const rand = createPRNG(42)
    // Disable auto-check — we do our own comparison with seed/iteration context.
    // This avoids a redundant freshRender() on every press.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
          item("col2", item("2a"), item("2b"), item("2c")),
          item("col3", item("3a"), item("3b")),
          item("col4", item("4a"), item("4b"), item("4c"), item("4d"), item("4e")),
        ),
      { incremental: true, columns: 100, rows: 24, viewMode: "list", checkIncremental: false },
    )

    const app = board._result

    // Original fuzz failure was at iteration 49. Navigate through all 52
    // iterations but only compare buffers near the failure point (47+)
    // to avoid the cost of freshRender() on every step.
    for (let i = 0; i < 52; i++) {
      const keyIndex = Math.floor(rand() * NAV_KEYS.length)
      const key = NAV_KEYS[keyIndex]!
      board.press(key)

      // Skip expensive fresh-render comparison for early iterations
      if (i < 47) continue

      const incrementalBuffer = app.lastBuffer()
      const freshBuffer = app.freshRender()

      if (!incrementalBuffer) continue

      const mismatch = compareBuffers(incrementalBuffer, freshBuffer)
      if (mismatch) {
        const msg = formatMismatch(mismatch, {
          incrementalText: bufferToText(incrementalBuffer),
          freshText: bufferToText(freshBuffer),
          seed: 42,
          iteration: i,
          key,
        })
        expect.unreachable(msg)
      }
    }
  })

  // Exact reproduction of scrolling/list seed=9999 (originally failed at iteration 0, key="l")
  test("scrolling/list seed=9999: exact fuzz sequence", { timeout: 15_000 }, () => {
    const rand = createPRNG(9999)
    // Disable auto-check — we do our own comparison with seed/iteration context.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", ...Array.from({ length: 12 }, (_, i) => item(`1-${String.fromCharCode(97 + i)}`))),
          item("col2", ...Array.from({ length: 10 }, (_, i) => item(`2-${String.fromCharCode(97 + i)}`))),
          item("col3", ...Array.from({ length: 8 }, (_, i) => item(`3-${String.fromCharCode(97 + i)}`))),
        ),
      { incremental: true, columns: 80, rows: 16, viewMode: "list", checkIncremental: false },
    )

    const app = board._result

    for (let i = 0; i < 10; i++) {
      const keyIndex = Math.floor(rand() * NAV_KEYS.length)
      const key = NAV_KEYS[keyIndex]!
      board.press(key)

      const incrementalBuffer = app.lastBuffer()
      const freshBuffer = app.freshRender()

      if (!incrementalBuffer) continue

      const mismatch = compareBuffers(incrementalBuffer, freshBuffer)
      if (mismatch) {
        const msg = formatMismatch(mismatch, {
          incrementalText: bufferToText(incrementalBuffer),
          freshText: bufferToText(freshBuffer),
          seed: 9999,
          iteration: i,
          key,
        })
        expect.unreachable(msg)
      }
    }
  })
})
