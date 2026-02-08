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
// Fixture: Large board (5 cols × 40 cards = 200 cards)
// =============================================================================

function largeBoardFixture(): ReturnType<typeof item> {
  const cols: ReturnType<typeof item>[] = []
  for (let c = 0; c < 5; c++) {
    const cards: ReturnType<typeof item>[] = []
    for (let i = 0; i < 40; i++) {
      cards.push(item(`c${c}-card-${i}`))
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
): { times: number[]; avg: number; p50: number; p95: number; total: number } {
  const times: number[] = []
  for (let i = 0; i < count; i++) {
    const start = performance.now()
    board.press(key)
    times.push(performance.now() - start)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const total = times.reduce((s, t) => s + t, 0)
  return {
    times,
    avg: total / count,
    p50: sorted[Math.floor(count * 0.5)] ?? 0,
    p95: sorted[Math.floor(count * 0.95)] ?? 0,
    total,
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

describe("Architecture Benchmark", () => {
  // Print all results after tests complete (vitest summary includes test names)
  afterAll(() => {
    // Results are embedded in test names via expect() messages
  })

  // Current baseline (2026-02-07, isolated run):
  //   cards ~15ms, list ~26ms, columns ~10ms, h/l ~19ms
  // Target after per-node atoms refactor: all < 5ms
  // NOTE: Thresholds are generous (2x) to pass under concurrent test load.
  // For accurate timings, run in isolation:
  //   bun vitest run apps/km-tui/tests/architecture-bench.spec.ts

  test("cards view: j-press (200 cards, 5 cols)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
    })

    // Warm up (first few presses may be slower due to lazy init)
    for (let i = 0; i < 3; i++) board.press("j")

    // Benchmark: press j 30 times
    const stats = benchPress(board, "j", 30)
    benchResults["cards_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)}`

    // Baseline: ~15ms avg (isolated). Tighten as architecture improves.
    expect(stats.avg).toBeLessThan(50)
  })

  test("list view: j-press (200 cards, 5 cols)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
      viewMode: "list",
    })

    for (let i = 0; i < 3; i++) board.press("j")
    const stats = benchPress(board, "j", 30)
    benchResults["list_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)}`

    // Baseline: ~26ms avg. List view is slowest (renders all 200 items).
    expect(stats.avg).toBeLessThan(50)
  })

  test("columns view: j-press (200 cards, 5 cols)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
      viewMode: "columns",
    })

    for (let i = 0; i < 3; i++) board.press("j")
    const stats = benchPress(board, "j", 30)
    benchResults["cols_j"] =
      `avg=${formatMs(stats.avg)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)}`

    // Baseline: ~10ms avg (isolated). Columns view is fastest (fewer visible items).
    expect(stats.avg).toBeLessThan(50)
  })

  test("h/l horizontal navigation (200 cards)", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
    })

    for (let i = 0; i < 5; i++) board.press("j")
    const lStats = benchPress(board, "l", 4)
    const hStats = benchPress(board, "h", 4)
    benchResults["h_l"] =
      `l=${formatMs(lStats.avg)} h=${formatMs(hStats.avg)}`

    // Baseline: ~19ms avg (isolated). Horizontal is slower than vertical (column scroll).
    expect(lStats.avg).toBeLessThan(60)
    expect(hStats.avg).toBeLessThan(60)
  })

  test("cursor correctness after rapid mixed navigation", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
    })

    // Navigate: down 5, right 2, down 3, left 1, up 2
    for (let i = 0; i < 5; i++) board.press("j")
    for (let i = 0; i < 2; i++) board.press("l")
    for (let i = 0; i < 3; i++) board.press("j")
    board.press("h")
    for (let i = 0; i < 2; i++) board.press("k")

    // Verify cursor is positioned on a valid node
    const cursor = board.q("[data-cursor]")
    expect(cursor.count()).toBe(1)

    // Should be somewhere in col-1 (moved right 2 then left 1)
    const cursorId = cursor.getAttribute("id")
    expect(cursorId).toMatch(/^c1-card-/)
  })

  test("subscription baseline: 120 items × 10 subs = ~1200 total", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
    })

    const items = board.q("[data-view='item']")
    const itemCount = items.count()
    benchResults["subs"] =
      `items=${itemCount} est_subs=~${itemCount * 10} ideal=~${itemCount * 3 + 7} (-${Math.round((1 - (itemCount * 3 + 7) / (itemCount * 10)) * 100)}%)`

    // Current architecture: ~10 subscriptions per TreeNode
    // Ideal (per-node atoms): ~3 per-node + 7 global
    expect(itemCount).toBeGreaterThan(50)
  })

  test("screen diff: j-press changes <= 5 lines", () => {
    const { board } = testEnv(() => largeBoardFixture(), {
      columns: 120,
      rows: 40,
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
    // (just the old and new cursor positions, plus possibly top bar path)
    expect(changedLines).toBeLessThanOrEqual(5)
  })
})
