/**
 * Architecture Benchmark — Measures render cost per keypress
 *
 * Purpose: Establish a baseline for the current architecture's performance
 * characteristics so we can measure improvement as we refactor toward
 * per-node atoms + synchronous layout derivation.
 *
 * What this measures:
 * - Time per j-press (cursor down) on large boards
 * - TreeNode render counts per keypress
 * - Store selector overhead
 * - Comparison across view modes (cards vs list vs columns)
 *
 * Run: bun vitest run apps/km-tui/tests/architecture-bench.spec.ts
 *
 * Results are stored in benchResults and printed as a table after all tests.
 */

import { describe, test, expect, afterAll } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// =============================================================================
// Fixture: Large board (8 cols × 60 cards × 3 sub-items = 1440+ nodes)
// =============================================================================

function largeBoardFixture(): ReturnType<typeof item> {
  const cols: ReturnType<typeof item>[] = []
  for (let c = 0; c < 8; c++) {
    const cards: ReturnType<typeof item>[] = []
    for (let i = 0; i < 60; i++) {
      // Each card has 3 nested sub-items (deeper hierarchy)
      const subs: ReturnType<typeof item>[] = []
      for (let s = 0; s < 3; s++) {
        subs.push(item(`c${c}-card-${i}-sub-${s}`))
      }
      cards.push(item(`c${c}-card-${i}`, ...subs))
    }
    cols.push(item(`col-${c}`, ...cards))
  }
  return item("bench-board", ...cols)
}

// =============================================================================
// Helpers
// =============================================================================

/** Press a key N times, return per-press timing in ms */
function benchPress(
  board: ReturnType<typeof testEnv>["board"],
  key: string,
  count: number,
): { times: number[]; avg: number; p50: number; p95: number; total: number; actAvg: number; renderAvg: number } {
  const times: number[] = []
  const actTimes: number[] = []
  const renderTimes: number[] = []
  for (let i = 0; i < count; i++) {
    const start = performance.now()
    board.press(key)
    times.push(performance.now() - start)
    const timing = (globalThis as any).__inkx_last_timing
    if (timing) {
      actTimes.push(timing.actMs)
      renderTimes.push(timing.renderMs)
    }
  }
  const sorted = [...times].sort((a, b) => a - b)
  const total = times.reduce((s, t) => s + t, 0)
  return {
    times,
    avg: total / count,
    p50: sorted[Math.floor(count * 0.5)] ?? 0,
    p95: sorted[Math.floor(count * 0.95)] ?? 0,
    total,
    actAvg: actTimes.length > 0 ? actTimes.reduce((s, t) => s + t, 0) / actTimes.length : 0,
    renderAvg: renderTimes.length > 0 ? renderTimes.reduce((s, t) => s + t, 0) / renderTimes.length : 0,
  }
}

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`
}

// Collect results across tests for summary
const benchResults: Record<string, string> = {}

// =============================================================================
// Benchmarks
// =============================================================================

describe("Architecture Benchmark", { timeout: 30000 }, () => {
  // Print all results after tests complete (vitest summary includes test names)
  afterAll(() => {
    console.log("\n--- Architecture Benchmark Results ---")
    for (const [key, value] of Object.entries(benchResults)) {
      console.log(`  ${key}: ${value}`)
    }
    console.log("---")
  })

  // Current baseline (2026-02-07, isolated run, 1440-node board 200x60):
  //   cards j ~85ms, list j ~35ms, columns j ~34ms, h/l ~150ms, zoom ~200ms
  // Target after per-node atoms refactor: all < 10ms
  // NOTE: Thresholds are generous (2-4x) to pass under concurrent test load.
  // For accurate timings, run in isolation:
  //   bun vitest run apps/km-tui/tests/architecture-bench.spec.ts

  test("cards view: j-press (1440 nodes, 8 cols, 3 levels)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    // Warm up (first few presses may be slower due to lazy init)
    for (let i = 0; i < 5; i++) board.press("j")

    // Benchmark: press j 50 times
    const stats = benchPress(board, "j", 50)
    benchResults["cards_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)} [act=${formatMs(stats.actAvg)} render=${formatMs(stats.renderAvg)}]`

    // Print pipeline phase breakdown for the last press
    const pipeline = (globalThis as any).__inkx_last_pipeline
    if (pipeline) {
      benchResults["cards_j_pipeline"] =
        `measure=${formatMs(pipeline.measure)} layout=${formatMs(pipeline.layout)} scroll=${formatMs(pipeline.scroll)} screenRect=${formatMs(pipeline.screenRect)} notify=${formatMs(pipeline.notify)} content=${formatMs(pipeline.content)} output=${formatMs(pipeline.output)}`
    }

    expect(stats.avg).toBeLessThan(200)
  })

  test("list view: j-press (1440 nodes, 8 cols, 3 levels)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
      viewMode: "list",
    })

    for (let i = 0; i < 5; i++) board.press("j")
    const stats = benchPress(board, "j", 50)
    benchResults["list_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)} [act=${formatMs(stats.actAvg)} render=${formatMs(stats.renderAvg)}]`

    expect(stats.avg).toBeLessThan(200)
  })

  test("columns view: j-press (1440 nodes, 8 cols, 3 levels)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
      viewMode: "columns",
    })

    for (let i = 0; i < 5; i++) board.press("j")
    const stats = benchPress(board, "j", 50)
    benchResults["cols_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)} [act=${formatMs(stats.actAvg)} render=${formatMs(stats.renderAvg)}]`

    expect(stats.avg).toBeLessThan(200)
  })

  test("h/l horizontal navigation (1440 nodes, 8 cols)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    for (let i = 0; i < 10; i++) board.press("j")
    const lStats = benchPress(board, "l", 7)
    const hStats = benchPress(board, "h", 7)
    benchResults["h_l"] = `l=${formatMs(lStats.avg)} h=${formatMs(hStats.avg)} [l:act=${formatMs(lStats.actAvg)} render=${formatMs(lStats.renderAvg)}]`

    expect(lStats.avg).toBeLessThan(250)
    expect(hStats.avg).toBeLessThan(250)
  })

  test("cursor correctness after rapid mixed navigation", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    // Navigate: down 10, right 4, down 5, left 2, up 3
    for (let i = 0; i < 10; i++) board.press("j")
    for (let i = 0; i < 4; i++) board.press("l")
    for (let i = 0; i < 5; i++) board.press("j")
    for (let i = 0; i < 2; i++) board.press("h")
    for (let i = 0; i < 3; i++) board.press("k")

    // Verify cursor is positioned on a valid node
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)

    // Should be in col-2 (moved right 4 then left 2)
    const cursorId = cursor.getAttribute("id")
    expect(cursorId).toMatch(/^c2-card-/)
  })

  test("subscription baseline: visible items × 10 subs", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    const items = board.q("[data-view='item']")
    const itemCount = items.count()
    benchResults["subs"] =
      `items=${itemCount} est_subs=~${itemCount * 10} ideal=~${itemCount * 3 + 7} (-${Math.round((1 - (itemCount * 3 + 7) / (itemCount * 10)) * 100)}%)`

    // With 1440 nodes, many more should be visible on 200x60 terminal
    expect(itemCount).toBeGreaterThan(100)
  })

  test("screen diff: j-press changes <= 5 lines", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    board.press("j")
    const before = board.screenshot()
    board.press("j")
    const after = board.screenshot()

    const beforeLines = before.split("\n")
    const afterLines = after.split("\n")
    let changedLines = 0
    const minLen = Math.min(beforeLines.length, afterLines.length)
    for (let i = 0; i < minLen; i++) {
      if (beforeLines[i] !== afterLines[i]) changedLines++
    }

    benchResults["diff"] =
      `changed=${changedLines}/${beforeLines.length} (ideal=2)`

    // In cards view, cursor movement should change very few lines
    expect(changedLines).toBeLessThanOrEqual(5)
  })

  test("outline depth navigation (< and > keys)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 200,
      rows: 60,
    })

    // Navigate down, then zoom into sub-items with >
    for (let i = 0; i < 5; i++) board.press("j")
    const zoomInStats = benchPress(board, ">", 3)
    benchResults["zoom_in"] = `avg=${formatMs(zoomInStats.avg)}`

    // Navigate some, then zoom out
    for (let i = 0; i < 3; i++) board.press("j")
    const zoomOutStats = benchPress(board, "<", 3)
    benchResults["zoom_out"] = `avg=${formatMs(zoomOutStats.avg)}`

    // Zoom involves full re-layout of the board — much more expensive than cursor moves
    expect(zoomInStats.avg).toBeLessThan(500)
    expect(zoomOutStats.avg).toBeLessThan(500)
  })
})
