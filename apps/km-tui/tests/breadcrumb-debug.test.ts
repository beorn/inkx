/**
 * Minimal test to debug breadcrumb stale after h/l navigation.
 * Uses global debug instrumentation to trace what happens in the content phase.
 */
import { describe, test, expect, vi } from "vitest"
import { bufferToText, compareBuffers } from "inkx/testing"
import { testEnv, item } from "./helpers/board-test.ts"

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

describe("breadcrumb debug", () => {
  test(`fuzz seed=42 with debug`, () => {
    // Suppress console output to avoid test framework rejection
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    const debugLog: string[] = ((globalThis as any).__inkx_debug_topbar = [])

    const rand = createPRNG(42)
    const { board } = testEnv(
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

      debugLog.length = 0
      board.press(key)

      const incrementalBuffer = app.lastBuffer()
      const freshBuffer = app.freshRender()

      if (!incrementalBuffer) continue

      const mismatch = compareBuffers(incrementalBuffer, freshBuffer)
      if (mismatch) {
        const incText = bufferToText(incrementalBuffer)
        const freshText = bufferToText(freshBuffer)
        const incLines = incText.split("\n")
        const freshLines = freshText.split("\n")

        // Restore console for output
        vi.restoreAllMocks()

        console.error(`\n=== MISMATCH at iteration ${i}, key='${key}' ===`)
        console.error("DEBUG LOG:")
        for (const line of debugLog) {
          console.error("  " + line)
        }
        console.error("inc row 0:", JSON.stringify(incLines[0]))
        console.error("frs row 0:", JSON.stringify(freshLines[0]))

        expect.unreachable(`Mismatch at iteration ${i}, key='${key}'`)
      }
    }

    vi.restoreAllMocks()
    // Enable debug output cleanup
    ;(globalThis as any).__inkx_debug_topbar = undefined
  })
})
