/**
 * Render Fuzz Test - Incremental vs Fresh Comparison
 *
 * After each navigation action, compares the incremental buffer (with buffer
 * reuse / dirty-region optimization) against a fresh render of the same tree.
 * Any pixel difference is definitionally a rendering bug — the fresh render
 * is the reference implementation.
 *
 * Runs as .slow.test.ts → included in `bun run test:all` but not `test:fast`.
 */

import { describe, test, expect } from "vitest"
import { bufferToText } from "inkx/testing"
import { compareBuffers, formatMismatch } from "inkx/testing"
import { testEnv, item } from "./helpers/board-test.ts"
import { parseRepeats, deriveSeeds } from "vitestx/fuzz"

// =============================================================================
// Seeded PRNG (xoshiro128** — fast, reproducible)
// =============================================================================

function createPRNG(seed: number) {
  // SplitMix32 to initialize state from a single seed
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

// =============================================================================
// Navigation Keys (safe — no dialogs, no mutations)
// =============================================================================

const NAV_KEYS = ["j", "k", "h", "l", "g", "G", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "<", ">"]

// =============================================================================
// Fixtures
// =============================================================================

function smallFixture() {
  return () => item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b")))
}

function mediumFixture() {
  return () =>
    item(
      "board",
      item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
      item("col2", item("2a"), item("2b"), item("2c")),
      item("col3", item("3a"), item("3b")),
      item("col4", item("4a"), item("4b"), item("4c"), item("4d"), item("4e")),
    )
}

function scrollingFixture() {
  return () =>
    item(
      "board",
      item("col1", ...Array.from({ length: 12 }, (_, i) => item(`1-${String.fromCharCode(97 + i)}`))),
      item("col2", ...Array.from({ length: 10 }, (_, i) => item(`2-${String.fromCharCode(97 + i)}`))),
      item("col3", ...Array.from({ length: 8 }, (_, i) => item(`3-${String.fromCharCode(97 + i)}`))),
    )
}

const FIXTURES = [
  { name: "small", builder: smallFixture, cols: 60, rows: 20 },
  { name: "medium", builder: mediumFixture, cols: 100, rows: 24 },
  { name: "scrolling", builder: scrollingFixture, cols: 80, rows: 16 },
] as const

const VIEW_MODES = ["cards", "columns", "list"] as const

const BASE_SEEDS = [42, 1337, 2024, 9999, 31415]
const ITERATIONS = 200

// When FUZZ_REPEATS > 1, derive additional seeds for extended coverage
const repeats = parseRepeats()
const SEEDS = repeats <= 1 ? BASE_SEEDS : [...BASE_SEEDS, ...deriveSeeds(42, repeats - BASE_SEEDS.length)]

// =============================================================================
// Test Suite
// =============================================================================

describe("render fuzz: incremental vs fresh", () => {
  for (const fixture of FIXTURES) {
    for (const viewMode of VIEW_MODES) {
      describe(`${fixture.name} / ${viewMode}`, () => {
        for (const seed of SEEDS) {
          test(`seed=${seed}`, { timeout: 30_000 }, () => {
            const rand = createPRNG(seed)
            const { board } = testEnv(fixture.builder(), {
              columns: fixture.cols,
              rows: fixture.rows,
              viewMode,
              incremental: true,
            })

            for (let i = 0; i < ITERATIONS; i++) {
              const keyIndex = Math.floor(rand() * NAV_KEYS.length)
              const key = NAV_KEYS[keyIndex]!
              board.press(key)

              const incrementalBuffer = board._result.lastBuffer()
              const freshBuffer = board._result.freshRender()

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
    }
  }
})
