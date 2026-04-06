/**
 * Architecture Benchmark — Measures render cost per keypress
 *
 * Purpose: Establish a baseline for the current architecture's performance
 * characteristics so we can measure improvement as we refactor toward
 * per-node atoms + synchronous layout derivation.
 *
 * What this measures:
 * - Time per j-press (cursor down) on large boards
 * - Comparison across view modes (cards vs list vs columns)
 * - h/l horizontal navigation cost
 * - Zoom (< and >) navigation cost
 *
 * Run: bun bench apps/km-tui/tests/architecture.bench.ts
 *
 * Current baseline (2026-02-07, isolated run, 1440-node board 200x60):
 *   cards j ~85ms, list j ~35ms, columns j ~34ms, h/l ~150ms, zoom ~200ms
 * Target after per-node atoms refactor: all < 10ms
 */

import { bench, describe } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

// =============================================================================
// Fixture: Large board (8 cols × 60 cards × 3 sub-items = 1440+ nodes)
// =============================================================================

function largeBoardFixture(): ReturnType<typeof item> {
  const cols: ReturnType<typeof item>[] = []
  for (let c = 0; c < 8; c++) {
    const cards: ReturnType<typeof item>[] = []
    for (let i = 0; i < 60; i++) {
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

// Each bench iteration is expensive (~50-200ms), so keep iterations low.
// vitest bench handles warmup and statistics automatically.
const BENCH_OPTIONS = { iterations: 10, warmupIterations: 3 }

// =============================================================================
// Benchmarks
// =============================================================================

describe("Architecture: j-press by view mode (1440 nodes)", () => {
  bench(
    "cards view",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
      })
      for (let i = 0; i < 10; i++) board.command("cursor_down")
    },
    BENCH_OPTIONS,
  )

  bench(
    "list view",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
        viewMode: "list",
      })
      for (let i = 0; i < 10; i++) board.command("cursor_down")
    },
    BENCH_OPTIONS,
  )

  bench(
    "columns view",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
        viewMode: "columns",
      })
      for (let i = 0; i < 10; i++) board.command("cursor_down")
    },
    BENCH_OPTIONS,
  )
})

describe("Architecture: h/l navigation (1440 nodes)", () => {
  bench(
    "l (move right)",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
      })
      for (let i = 0; i < 5; i++) board.command("cursor_down")
      for (let i = 0; i < 7; i++) board.command("cursor_right")
    },
    BENCH_OPTIONS,
  )

  bench(
    "h (move left)",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
      })
      for (let i = 0; i < 5; i++) board.command("cursor_down")
      for (let i = 0; i < 7; i++) board.command("cursor_right")
      for (let i = 0; i < 7; i++) board.command("cursor_left")
    },
    BENCH_OPTIONS,
  )
})

describe("Architecture: zoom navigation (1440 nodes)", () => {
  bench(
    "> (zoom in)",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
      })
      for (let i = 0; i < 5; i++) board.command("cursor_down")
      for (let i = 0; i < 3; i++) board.command("unfold_all_more")
    },
    BENCH_OPTIONS,
  )

  bench(
    "< (zoom out)",
    () => {
      const { board } = testEnv(() => largeBoardFixture(), {
        columns: 200,
        rows: 60,
      })
      for (let i = 0; i < 5; i++) board.command("cursor_down")
      for (let i = 0; i < 3; i++) board.command("unfold_all_more")
      for (let i = 0; i < 3; i++) board.command("cursor_down")
      for (let i = 0; i < 3; i++) board.command("fold_all_more")
    },
    BENCH_OPTIONS,
  )
})
