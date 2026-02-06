/**
 * Cursor Movement Performance Test
 *
 * Measures time for cursor movement (j/k) key handling
 * to identify performance bottlenecks.
 *
 * Run with: DEBUG=km:perf bun test cursor-perf
 */

import { describe, test, expect } from "vitest"
import { createLogger } from "@beorn/logger"
import { testEnv, item } from "./helpers/board-test.ts"

const log = createLogger("km:perf")

describe("Cursor Movement Performance", () => {
  test("measure cursor movement timing in small board", () => {
    // Create a board with 3 columns, each with 5 items
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item("1a"),
          item("1b"),
          item("1c"),
          item("1d"),
          item("1e"),
        ),
        item(
          "col2",
          item("2a"),
          item("2b"),
          item("2c"),
          item("2d"),
          item("2e"),
        ),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )

    // Warm up - first render already happened in testEnv()
    board.expect("#1a[data-cursor]").toExist()

    // Measure cursor down (j) movements
    const downTimes: number[] = []
    for (let i = 0; i < 4; i++) {
      const start = performance.now()
      board.press("j")
      const duration = performance.now() - start
      downTimes.push(duration)
    }

    // Measure cursor up (k) movements
    const upTimes: number[] = []
    for (let i = 0; i < 4; i++) {
      const start = performance.now()
      board.press("k")
      const duration = performance.now() - start
      upTimes.push(duration)
    }

    // Measure column navigation (l/h)
    const rightTimes: number[] = []
    for (let i = 0; i < 2; i++) {
      const start = performance.now()
      board.press("l")
      const duration = performance.now() - start
      rightTimes.push(duration)
    }

    const leftTimes: number[] = []
    for (let i = 0; i < 2; i++) {
      const start = performance.now()
      board.press("h")
      const duration = performance.now() - start
      leftTimes.push(duration)
    }

    // Calculate averages
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const max = (arr: number[]) => Math.max(...arr)

    log.debug?.("=== Cursor Movement Performance ===")
    log.debug?.(
      `Down (j): avg=${avg(downTimes).toFixed(2)}ms max=${max(downTimes).toFixed(2)}ms`,
    )
    log.debug?.(
      `Up (k):   avg=${avg(upTimes).toFixed(2)}ms max=${max(upTimes).toFixed(2)}ms`,
    )
    log.debug?.(
      `Right (l): avg=${avg(rightTimes).toFixed(2)}ms max=${max(rightTimes).toFixed(2)}ms`,
    )
    log.debug?.(
      `Left (h):  avg=${avg(leftTimes).toFixed(2)}ms max=${max(leftTimes).toFixed(2)}ms`,
    )

    // Assert reasonable performance (< 16ms for 60fps)
    // Note: test renderer may have different timing than real TUI
    expect(avg(downTimes)).toBeLessThan(100) // generous for test environment
    expect(avg(upTimes)).toBeLessThan(100)
  })

  test("measure cursor movement timing in large board (scrolling)", () => {
    // Create a tall board that requires scrolling
    const items = Array.from({ length: 30 }, (_, i) => item(`item${i + 1}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...items)),
      { rows: 24, columns: 80 }, // Fixed viewport height
    )

    // Initial position
    board.expect("#item1[data-cursor]").toExist()

    // Move down past the viewport (should trigger scroll)
    const scrollTimes: number[] = []
    for (let i = 0; i < 25; i++) {
      const start = performance.now()
      board.press("j")
      const duration = performance.now() - start
      scrollTimes.push(duration)
    }

    // Now measure movement in the middle of a scrolled view
    const postScrollTimes: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      board.press("k") // move up
      const duration = performance.now() - start
      postScrollTimes.push(duration)
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const max = (arr: number[]) => Math.max(...arr)
    const p95 = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length * 0.95)]
    }

    log.debug?.("=== Large Board (with scrolling) ===")
    log.debug?.(
      `Scroll down: avg=${avg(scrollTimes).toFixed(2)}ms max=${max(scrollTimes).toFixed(2)}ms p95=${p95(scrollTimes)?.toFixed(2)}ms`,
    )
    log.debug?.(
      `Post-scroll movement: avg=${avg(postScrollTimes).toFixed(2)}ms max=${max(postScrollTimes).toFixed(2)}ms`,
    )

    // After scrolling, cursor movement should still be fast
    expect(avg(postScrollTimes)).toBeLessThan(100)
  })
})
