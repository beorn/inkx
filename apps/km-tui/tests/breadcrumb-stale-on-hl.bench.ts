/**
 * Regression: breadcrumb (top bar) shows stale cursor path after h/l navigation.
 *
 * After pressing "l" to move to the next column, the incremental render shows
 * the OLD cursor position in the breadcrumb, while a fresh render shows the
 * correct new position. Card content renders correctly — only the breadcrumb
 * header is stale.
 *
 * Root cause hypothesis: The breadcrumb component (BoardTopBar) isn't marked
 * dirty by the incremental renderer when the cursor changes via horizontal
 * navigation, even though the cursor position state has changed.
 *
 * Bug: km-e3rwl
 */

import { describe, test, expect } from "vitest"
import { bufferToText, compareBuffers, formatMismatch } from "@silvery/test"
import { createDriverTest, item } from "./helpers/board-test.ts"

// Seeded PRNG (from render-fuzz.fuzz.ts)
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

describe("breadcrumb stale after h/l navigation", () => {
  // Fuzz-style: random nav keys, check incremental vs fresh after each h/l
  for (const seed of [42, 1337, 2024, 9999, 31415]) {
    test(`incremental render matches fresh after h/l nav (seed=${seed})`, { timeout: 15000 }, () => {
      const rand = createPRNG(seed)
      const { board } = createDriverTest(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
            item("col3", item("3a"), item("3b")),
          ),
        { incremental: true, columns: 60, rows: 20 },
      )

      const app = board._result

      for (let i = 0; i < 200; i++) {
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
            seed,
            iteration: i,
            key,
          })
          expect.unreachable(msg)
        }
      }
    })
  }

  // Also test with medium fixture (more columns, more chances for breadcrumb divergence)
  for (const seed of [42, 1337, 2024]) {
    test(`medium fixture incremental match (seed=${seed})`, { timeout: 15000 }, () => {
      const rand = createPRNG(seed)
      const { board } = createDriverTest(
        () =>
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
            item("col2", item("2a"), item("2b"), item("2c")),
            item("col3", item("3a"), item("3b")),
            item("col4", item("4a"), item("4b"), item("4c"), item("4d"), item("4e")),
          ),
        { incremental: true, columns: 100, rows: 24 },
      )

      const app = board._result

      for (let i = 0; i < 200; i++) {
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
            seed,
            iteration: i,
            key,
          })
          expect.unreachable(msg)
        }
      }
    })
  }
})
