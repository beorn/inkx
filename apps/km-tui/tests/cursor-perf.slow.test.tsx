/**
 * Cursor Movement Performance Tests
 *
 * Wall-clock timing + per-phase pipeline breakdown for cursor navigation.
 * Uses synthetic fixtures (no real vault dependency).
 *
 * Run with: DEBUG=km:perf bun vitest run apps/km-tui/tests/cursor-perf.test.tsx
 */

import { describe, test, expect } from "vitest"
import { createLogger } from "@beorn/logger"
import { testEnv, item } from "./helpers/board-test.ts"

const log = createLogger("km:perf")

// =============================================================================
// Helpers
// =============================================================================

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const max = (arr: number[]) => Math.max(...arr)

interface PipelineTiming {
  measure: number
  layout: number
  scroll: number
  screenRect: number
  notify: number
  content: number
  output: number
  total: number
}

function getLastPipeline(): PipelineTiming | null {
  return (globalThis as any).__inkx_last_pipeline ?? null
}

// =============================================================================
// Wall-clock timing
// =============================================================================

describe("Cursor Movement Performance", () => {
  test("j/k/h/l on small board", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
        item("col3", item("3a"), item("3b"), item("3c")),
      ),
    )
    board.expect("#1a[data-cursor]").toExist()

    const measure = (key: string, count: number) => {
      const times: number[] = []
      for (let i = 0; i < count; i++) {
        const start = performance.now()
        board.press(key)
        times.push(performance.now() - start)
      }
      return times
    }

    const downTimes = measure("j", 4)
    const upTimes = measure("k", 4)
    const rightTimes = measure("l", 2)
    const leftTimes = measure("h", 2)

    log.debug?.("=== Cursor Movement Performance ===")
    log.debug?.(`Down (j): avg=${avg(downTimes).toFixed(2)}ms max=${max(downTimes).toFixed(2)}ms`)
    log.debug?.(`Up (k):   avg=${avg(upTimes).toFixed(2)}ms max=${max(upTimes).toFixed(2)}ms`)
    log.debug?.(`Right (l): avg=${avg(rightTimes).toFixed(2)}ms max=${max(rightTimes).toFixed(2)}ms`)
    log.debug?.(`Left (h):  avg=${avg(leftTimes).toFixed(2)}ms max=${max(leftTimes).toFixed(2)}ms`)

    expect(avg(downTimes)).toBeLessThan(100)
    expect(avg(upTimes)).toBeLessThan(100)
  })

  test("scrolling: 25 j-presses past viewport on 30-item board", () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`item${i + 1}`))
    const { board } = testEnv(() => item("board", item("col1", ...items)), { rows: 24, columns: 80 })

    board.expect("#item1[data-cursor]").toExist()

    const scrollTimes: number[] = []
    for (let i = 0; i < 25; i++) {
      const start = performance.now()
      board.press("j")
      scrollTimes.push(performance.now() - start)
    }

    const postScrollTimes: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      board.press("k")
      postScrollTimes.push(performance.now() - start)
    }

    log.debug?.("=== Large Board (with scrolling) ===")
    log.debug?.(`Scroll down: avg=${avg(scrollTimes).toFixed(2)}ms max=${max(scrollTimes).toFixed(2)}ms`)
    log.debug?.(`Post-scroll: avg=${avg(postScrollTimes).toFixed(2)}ms max=${max(postScrollTimes).toFixed(2)}ms`)

    expect(avg(postScrollTimes)).toBeLessThan(150)
  })
})

// =============================================================================
// Per-phase pipeline breakdown
// =============================================================================

describe("Pipeline Phase Breakdown", () => {
  test("per-phase timing on large board (8 cols × 60 cards)", () => {
    // Build a realistic-sized board
    const cols: ReturnType<typeof item>[] = []
    for (let c = 0; c < 8; c++) {
      const cards: ReturnType<typeof item>[] = []
      for (let i = 0; i < 60; i++) {
        cards.push(item(`c${c}-${i}`))
      }
      cols.push(item(`col-${c}`, ...cards))
    }

    const { board } = testEnv(() => item("board", ...cols), {
      columns: 300,
      rows: 120,
      incremental: true,
    })

    // Warm up (2 presses)
    board.press("j")
    board.press("j")

    // Capture 10 cursor moves with wall-clock and pipeline timing
    interface Sample {
      wallMs: number
      pipeline: PipelineTiming | null
    }
    const samples: Sample[] = []

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      board.press("j")
      samples.push({
        wallMs: performance.now() - t0,
        pipeline: getLastPipeline() ? { ...getLastPipeline()! } : null,
      })
    }

    // Log per-phase breakdown (visible with DEBUG=km:perf)
    const withPipeline = samples.filter((s) => s.pipeline != null)
    if (withPipeline.length > 0) {
      log.debug?.("\n=== Per-Phase Pipeline Breakdown (300x120, 480 nodes) ===")
      log.debug?.("  press | wall   | pipeline | measure | layout | scroll | content | output")
      log.debug?.("  ------|--------|----------|---------|--------|--------|---------|-------")
      for (const [i, s] of withPipeline.entries()) {
        const p = s.pipeline!
        log.debug?.(
          `  j[${i.toString().padStart(2)}] | ${s.wallMs.toFixed(1).padStart(5)}ms | ${p.total.toFixed(1).padStart(7)}ms | ${p.measure.toFixed(1).padStart(6)}ms | ${p.layout.toFixed(1).padStart(5)}ms | ${p.scroll.toFixed(1).padStart(5)}ms | ${p.content.toFixed(1).padStart(6)}ms | ${p.output.toFixed(1).padStart(5)}ms`,
        )
      }

      const pavg = (fn: (p: PipelineTiming) => number) =>
        (withPipeline.reduce((sum, s) => sum + fn(s.pipeline!), 0) / withPipeline.length).toFixed(1)

      log.debug?.(
        `\n  AVG: wall=${avg(samples.map((s) => s.wallMs)).toFixed(1)}ms  pipeline=${pavg((p) => p.total)}ms  measure=${pavg((p) => p.measure)}ms  layout=${pavg((p) => p.layout)}ms  content=${pavg((p) => p.content)}ms  output=${pavg((p) => p.output)}ms`,
      )
    }

    // Assert phase budgets (generous for CI — real perf tracked in .bench.ts)
    expect(avg(samples.map((s) => s.wallMs))).toBeLessThan(200)

    if (withPipeline.length > 0) {
      const avgPipeline = avg(withPipeline.map((s) => s.pipeline!.total))
      const avgLayout = avg(withPipeline.map((s) => s.pipeline!.layout))
      const avgContent = avg(withPipeline.map((s) => s.pipeline!.content))

      expect(avgPipeline).toBeLessThan(200)
      expect(avgLayout).toBeLessThan(100)
      expect(avgContent).toBeLessThan(150)
    }
  })

  test("per-phase timing on small terminal (80x24)", () => {
    const items = Array.from({ length: 100 }, (_, i) => item(`task${i}`))
    const { board } = testEnv(() => item("board", item("col", ...items)), {
      columns: 80,
      rows: 24,
      incremental: true,
    })

    board.press("j")
    board.press("j")

    const samples: { wallMs: number; pipeline: PipelineTiming | null }[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      board.press("j")
      samples.push({
        wallMs: performance.now() - t0,
        pipeline: getLastPipeline() ? { ...getLastPipeline()! } : null,
      })
    }

    const withPipeline = samples.filter((s) => s.pipeline != null)
    if (withPipeline.length > 0) {
      log.debug?.("\n=== Per-Phase Pipeline Breakdown (80x24, 100 nodes) ===")
      for (const [i, s] of withPipeline.entries()) {
        const p = s.pipeline!
        log.debug?.(
          `  j[${i}]: wall=${s.wallMs.toFixed(1)}ms  pipeline=${p.total.toFixed(1)}ms  layout=${p.layout.toFixed(1)}ms  content=${p.content.toFixed(1)}ms`,
        )
      }
    }

    // Small terminal should be faster than large
    expect(avg(samples.map((s) => s.wallMs))).toBeLessThan(150)
  })
})
